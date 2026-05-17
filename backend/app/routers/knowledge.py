from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.knowledge import OrgKnowledge, ContactList
from app.models.user import User, UserRole
from app.schemas.knowledge import OrgKnowledgeUpdate, OrgKnowledgeResponse, ContactCreate, ContactResponse
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("", response_model=OrgKnowledgeResponse)
async def get_knowledge(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OrgKnowledge).limit(1))
    knowledge = result.scalar_one_or_none()
    if not knowledge:
        knowledge = OrgKnowledge()
        db.add(knowledge)
        await db.commit()
        await db.refresh(knowledge)
    return knowledge


@router.patch("", response_model=OrgKnowledgeResponse)
async def update_knowledge(body: OrgKnowledgeUpdate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OrgKnowledge).limit(1))
    knowledge = result.scalar_one_or_none()
    if not knowledge:
        knowledge = OrgKnowledge()
        db.add(knowledge)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(knowledge, field, value)

    await db.commit()
    await db.refresh(knowledge)
    return knowledge


@router.get("/contacts", response_model=list[ContactResponse])
async def list_contacts(
    contact_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ContactList).order_by(ContactList.name)
    if contact_type:
        query = query.where(ContactList.contact_type == contact_type)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/contacts", response_model=ContactResponse, status_code=201)
async def create_contact(body: ContactCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    contact = ContactList(**body.model_dump())
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.patch("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(contact_id: str, body: ContactCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContactList).where(ContactList.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in body.model_dump().items():
        setattr(contact, field, value)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContactList).where(ContactList.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(contact)
    await db.commit()
