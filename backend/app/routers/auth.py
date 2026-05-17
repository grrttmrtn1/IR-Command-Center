from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from app.database import get_db
from app.models.user import User, Session, MFABackupCode, UserRole
from app.schemas.auth import (
    LoginRequest, TokenResponse, UserResponse, UserUpdate,
    PasswordChange, MFASetupResponse, MFAVerifyRequest,
)
from app.auth.jwt import create_access_token, create_refresh_token, hash_token
from app.auth.totp import (
    generate_totp_secret, get_totp_uri, generate_qr_code_b64,
    verify_totp, generate_backup_codes,
)
from app.middleware.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.mfa_enabled:
        if not body.mfa_code:
            raise HTTPException(status_code=status.HTTP_200_OK, detail="MFA_REQUIRED")
        if not verify_totp(user.mfa_secret, body.mfa_code):
            result2 = await db.execute(
                select(MFABackupCode).where(
                    MFABackupCode.user_id == user.id,
                    MFABackupCode.used_at == None,
                )
            )
            backup_codes = result2.scalars().all()
            from app.auth.totp import verify_backup_code
            matched = next((bc for bc in backup_codes if verify_backup_code(body.mfa_code, bc.code_hash)), None)
            if not matched:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")
            matched.used_at = datetime.now(timezone.utc)

    access_token = create_access_token(user.id, user.role.value)
    plaintext_refresh, refresh_hash = create_refresh_token()

    session = Session(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(session)
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=plaintext_refresh,
        httponly=True,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
    )

    return TokenResponse(access_token=access_token, user_id=user.id, role=user.role.value)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        token_hash = hash_token(refresh_token)
        result = await db.execute(select(Session).where(Session.token_hash == token_hash))
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)
            await db.commit()

    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh = request.cookies.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    token_hash = hash_token(refresh)
    result = await db.execute(
        select(Session).where(Session.token_hash == token_hash)
    )
    session = result.scalar_one_or_none()

    if not session or session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    result2 = await db.execute(select(User).where(User.id == session.user_id, User.is_active == True))
    user = result2.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access_token = create_access_token(user.id, user.role.value)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )

    return TokenResponse(access_token=access_token, user_id=user.id, role=user.role.value)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(body: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        user.email = body.email
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/me/change-password")
async def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.password_hash or not pwd_context.verify(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    user.password_hash = pwd_context.hash(body.new_password)
    user.must_change_password = False
    await db.commit()
    return {"message": "Password updated"}


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user.email)
    qr_b64 = generate_qr_code_b64(uri)
    backup_codes_pairs = generate_backup_codes()

    # Store secret temporarily (not activated until verify)
    user.mfa_secret = secret

    # Clear old backup codes, store new ones
    result = await db.execute(select(MFABackupCode).where(MFABackupCode.user_id == user.id))
    for bc in result.scalars().all():
        await db.delete(bc)

    for plaintext, code_hash in backup_codes_pairs:
        db.add(MFABackupCode(user_id=user.id, code_hash=code_hash))

    await db.commit()

    return MFASetupResponse(
        secret=secret,
        qr_code_b64=qr_b64,
        backup_codes=[p for p, _ in backup_codes_pairs],
    )


@router.post("/mfa/verify")
async def verify_mfa(body: MFAVerifyRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not configured")
    if not verify_totp(user.mfa_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    user.mfa_enabled = True
    await db.commit()
    return {"message": "MFA enabled"}


@router.delete("/mfa")
async def disable_mfa(body: MFAVerifyRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.mfa_enabled or not verify_totp(user.mfa_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    user.mfa_enabled = False
    user.mfa_secret = None
    await db.commit()
    return {"message": "MFA disabled"}
