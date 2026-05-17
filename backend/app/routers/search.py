import re
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from pydantic import BaseModel
from app.database import get_db
from app.models.incident import Incident, IOC, IncidentTask
from app.models.document import Document
from app.models.comms import CommsDraft
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchResult(BaseModel):
    type: str
    id: str
    title: str
    snippet: str | None
    incident_id: str | None
    href: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str


def _sanitize_query(q: str) -> str:
    q = q.strip()
    q = re.sub(r"[^\w\s\-]", " ", q)
    parts = [p for p in q.split() if p]
    if not parts:
        return ""
    return " & ".join(f"{p}:*" for p in parts)


@router.get("/", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, max_length=200),
    types: str = Query("incidents,iocs,tasks,documents,comms"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tsquery = _sanitize_query(q)
    if not tsquery:
        return SearchResponse(results=[], query=q)

    requested = set(types.split(","))
    results: list[SearchResult] = []

    ts_fn = func.to_tsvector("english")
    tsq = func.to_tsquery("english", tsquery)

    if "incidents" in requested:
        expr = func.to_tsvector("english", Incident.title + " " + func.coalesce(Incident.description, ""))
        rows = (await db.execute(
            select(Incident).where(expr.op("@@")(tsq)).limit(5)
        )).scalars().all()
        for r in rows:
            results.append(SearchResult(
                type="incident",
                id=r.id,
                title=r.title,
                snippet=r.description[:120] if r.description else None,
                incident_id=r.id,
                href=f"/incidents/{r.id}",
            ))

    if "iocs" in requested:
        expr = func.to_tsvector("english", IOC.value + " " + func.coalesce(IOC.notes, ""))
        rows = (await db.execute(
            select(IOC).where(expr.op("@@")(tsq)).limit(5)
        )).scalars().all()
        for r in rows:
            results.append(SearchResult(
                type="ioc",
                id=r.id,
                title=r.value,
                snippet=f"{r.ioc_type} — {r.notes[:80] if r.notes else ''}",
                incident_id=r.incident_id,
                href=f"/incidents/{r.incident_id}/iocs",
            ))

    if "tasks" in requested:
        expr = func.to_tsvector("english", IncidentTask.title + " " + func.coalesce(IncidentTask.description, ""))
        rows = (await db.execute(
            select(IncidentTask).where(expr.op("@@")(tsq)).limit(5)
        )).scalars().all()
        for r in rows:
            href = f"/incidents/{r.incident_id}/tasks" if r.incident_id else "/tasks"
            results.append(SearchResult(
                type="task",
                id=r.id,
                title=r.title,
                snippet=r.description[:120] if r.description else None,
                incident_id=r.incident_id,
                href=href,
            ))

    if "documents" in requested:
        expr = func.to_tsvector("english", Document.title + " " + func.coalesce(Document.content, ""))
        rows = (await db.execute(
            select(Document).where(expr.op("@@")(tsq)).limit(5)
        )).scalars().all()
        for r in rows:
            results.append(SearchResult(
                type="document",
                id=r.id,
                title=r.title,
                snippet=r.content[:120] if r.content else None,
                incident_id=None,
                href="/documents",
            ))

    if "comms" in requested:
        expr = func.to_tsvector("english", CommsDraft.title + " " + func.coalesce(CommsDraft.content, ""))
        rows = (await db.execute(
            select(CommsDraft).where(expr.op("@@")(tsq)).limit(5)
        )).scalars().all()
        for r in rows:
            results.append(SearchResult(
                type="comms",
                id=r.id,
                title=r.title,
                snippet=r.content[:120] if r.content else None,
                incident_id=r.incident_id,
                href="/communications",
            ))

    return SearchResponse(results=results, query=q)
