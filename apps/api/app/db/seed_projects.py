from datetime import UTC, datetime, timedelta
from pathlib import Path
import uuid
from app.models.attachment import AttachmentModel
from app.models.project import ProjectModel, ProjectStatus
from app.models.user import UserModel
from app.services.attachment import AttachmentService
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.seed.projects")


COVERS_SVG = {
    "night_orchard": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a2f"/>
      <stop offset="100%" stop-color="#0f201b"/>
    </linearGradient>
  </defs>
  <rect width="300" height="420" rx="8" fill="url(#g1)"/>
  <circle cx="150" cy="130" r="45" fill="#fcd34d" opacity="0.9"/>
  <!-- stylized orchard trees -->
  <path d="M60 380 Q90 240 120 380 Z" fill="#142c22"/>
  <path d="M120 380 Q150 210 180 380 Z" fill="#0d1f18"/>
  <path d="M180 380 Q210 230 240 380 Z" fill="#163327"/>
  <path d="M20 380 Q60 270 100 380 Z" fill="#0a1813"/>
  <path d="M200 380 Q240 260 280 380 Z" fill="#0c1d16"/>
  <!-- fruit dots -->
  <circle cx="110" cy="270" r="4" fill="#ef4444"/>
  <circle cx="130" cy="250" r="4" fill="#ef4444"/>
  <circle cx="170" cy="245" r="4" fill="#ef4444"/>
  <circle cx="190" cy="265" r="4" fill="#ef4444"/>
  <circle cx="75" cy="300" r="3.5" fill="#ef4444"/>
  <circle cx="225" cy="290" r="3.5" fill="#ef4444"/>
  <text x="150" y="60" text-anchor="middle" font-family="serif" font-size="20" font-weight="bold" fill="#f8fafc" letter-spacing="1.5">THE NIGHT ORCHARD</text>
  <text x="150" y="82" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#94a3b8" letter-spacing="2">MARA VOSS</text>
</svg>""",
    "still_water": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
  <rect width="300" height="420" rx="8" fill="#f8fafc"/>
  <rect x="12" y="12" width="276" height="396" rx="6" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
  <!-- water ripple contours -->
  <path d="M30 180 Q150 140 270 180" fill="none" stroke="#0284c7" stroke-width="2" opacity="0.6"/>
  <path d="M30 210 Q150 170 270 210" fill="none" stroke="#0284c7" stroke-width="2" opacity="0.5"/>
  <path d="M30 240 Q150 200 270 240" fill="none" stroke="#0284c7" stroke-width="2" opacity="0.4"/>
  <path d="M30 270 Q150 230 270 270" fill="none" stroke="#0284c7" stroke-width="2" opacity="0.3"/>
  <path d="M30 300 Q150 260 270 300" fill="none" stroke="#0284c7" stroke-width="2" opacity="0.2"/>
  <text x="150" y="80" text-anchor="middle" font-family="serif" font-size="22" font-style="italic" fill="#0f172a">A Map of</text>
  <text x="150" y="110" text-anchor="middle" font-family="serif" font-size="24" font-weight="bold" fill="#0284c7">STILL WATER</text>
  <text x="150" y="360" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#64748b" letter-spacing="2">JON BELL</text>
</svg>""",
    "winter_notes": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
  <defs>
    <linearGradient id="sepia" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fdfbf7"/>
      <stop offset="100%" stop-color="#f5ede0"/>
    </linearGradient>
  </defs>
  <rect width="300" height="420" rx="8" fill="url(#sepia)"/>
  <!-- vintage grasses -->
  <path d="M70 390 Q90 280 80 180 M80 230 Q60 200 65 170 M80 260 Q100 230 95 200" stroke="#78716c" stroke-width="1.8" fill="none"/>
  <path d="M150 390 Q140 260 150 150 M145 210 Q125 180 130 150 M148 240 Q168 210 162 180" stroke="#57534e" stroke-width="2" fill="none"/>
  <path d="M220 390 Q200 270 215 170 M210 220 Q190 190 195 160 M212 250 Q232 220 228 190" stroke="#78716c" stroke-width="1.8" fill="none"/>
  <text x="150" y="65" text-anchor="middle" font-family="serif" font-size="18" font-weight="bold" fill="#292524" letter-spacing="1">FIELD NOTES FOR WINTER</text>
  <text x="150" y="85" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#78716c" letter-spacing="2">CLAIRE NORTH</text>
</svg>""",
    "last_light": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
  <defs>
    <linearGradient id="sunset" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#312e81"/>
      <stop offset="80%" stop-color="#9a3412"/>
      <stop offset="100%" stop-color="#ea580c"/>
    </linearGradient>
  </defs>
  <rect width="300" height="420" rx="8" fill="url(#sunset)"/>
  <!-- mountain silhouettes -->
  <path d="M0 340 L80 280 L160 320 L240 260 L300 310 L300 420 L0 420 Z" fill="#020617"/>
  <text x="150" y="70" text-anchor="middle" font-family="serif" font-size="20" font-weight="bold" fill="#ffedd5" letter-spacing="1.5">AFTER THE LAST LIGHT</text>
  <text x="150" y="92" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#fed7aa" letter-spacing="2">SAMUEL ROOK</text>
</svg>""",
    "wild_index": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
  <rect width="300" height="420" rx="8" fill="#f4f1ea"/>
  <rect x="14" y="14" width="272" height="392" rx="4" fill="none" stroke="#8c8275" stroke-width="1"/>
  <!-- botanical specimen grid -->
  <rect x="25" y="110" width="70" height="110" rx="4" fill="#e7e2d6"/>
  <rect x="115" y="110" width="70" height="110" rx="4" fill="#e7e2d6"/>
  <rect x="205" y="110" width="70" height="110" rx="4" fill="#e7e2d6"/>
  <circle cx="60" cy="165" r="22" fill="#2d5a27" opacity="0.6"/>
  <circle cx="150" cy="165" r="22" fill="#854d0e" opacity="0.6"/>
  <circle cx="240" cy="165" r="22" fill="#155e75" opacity="0.6"/>
  <text x="150" y="65" text-anchor="middle" font-family="serif" font-size="22" font-weight="bold" fill="#27272a" letter-spacing="2">THE WILD INDEX</text>
  <text x="150" y="85" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#52525b" letter-spacing="2">LEONIE HART</text>
</svg>""",
}


async def create_cover_attachment(
    key_name: str,
    svg_content: str,
    filename: str,
    db: AsyncSession,
) -> AttachmentModel:
    attachment_id = str(uuid.uuid4())
    object_key = f"attachments/{attachment_id}/{filename}"
    content_bytes = svg_content.encode("utf-8")

    # Store locally
    local_path = AttachmentService.get_local_file_path(object_key)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content_bytes)

    attachment = AttachmentModel(
        id=attachment_id,
        key=object_key,
        filename=filename,
        content_type="image/svg+xml",
        size=len(content_bytes),
        claimed_at=datetime.now(UTC),
    )
    db.add(attachment)
    await db.flush()
    return attachment


async def seed_projects_data(db: AsyncSession, user: UserModel) -> None:
    """Seed initial projects matching the exact design screenshots if empty."""
    existing_count = (
        await db.execute(select(ProjectModel).limit(1))
    ).scalar_one_or_none()

    if existing_count is not None:
        return

    logger.info("Seeding realistic projects from design mocks...")
    now = datetime.now(UTC)

    # 1. The Night Orchard
    cover1 = await create_cover_attachment(
        "night_orchard", COVERS_SVG["night_orchard"], "the_night_orchard_cover.svg", db
    )
    p1 = ProjectModel(
        title="The Night Orchard",
        author="Mara Voss",
        owner=user.handle,
        source="DOCX",
        status=ProjectStatus.IN_PRODUCTION.value,
        language="English",
        genre="Literary Fiction",
        thumbnail_attachment_id=cover1.id,
        user_id=user.id,
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(minutes=12),
    )
    db.add(p1)

    # 2. A Map of Still Water
    cover2 = await create_cover_attachment(
        "still_water", COVERS_SVG["still_water"], "map_of_still_water_cover.svg", db
    )
    p2 = ProjectModel(
        title="A Map of Still Water",
        author="Jon Bell",
        owner=user.handle,
        source="PDF",
        status=ProjectStatus.REVIEW.value,
        language="English",
        genre="Poetry",
        thumbnail_attachment_id=cover2.id,
        user_id=user.id,
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=1),
    )
    db.add(p2)

    # 3. Small Kingdoms (Notice: No thumbnail in card view! Triggers dashed placeholder)
    p3 = ProjectModel(
        title="Small Kingdoms",
        author="Ari Okafor",
        owner=user.handle,
        source="EPUB",
        status=ProjectStatus.READY_TO_PARSE.value,
        language="English",
        genre="Speculative Fiction",
        thumbnail_attachment_id=None,
        user_id=user.id,
        created_at=now - timedelta(days=9),
        updated_at=now - timedelta(days=8),
    )
    db.add(p3)

    # 4. Field Notes for Winter
    cover4 = await create_cover_attachment(
        "winter_notes", COVERS_SVG["winter_notes"], "field_notes_winter_cover.svg", db
    )
    p4 = ProjectModel(
        title="Field Notes for Winter",
        author="Claire North",
        owner=user.handle,
        source="DOCX",
        status=ProjectStatus.COMPLETE.value,
        language="English",
        genre="Non-Fiction",
        thumbnail_attachment_id=cover4.id,
        user_id=user.id,
        created_at=now - timedelta(days=15),
        updated_at=now - timedelta(days=13),
    )
    db.add(p4)

    # 5. After the Last Light
    cover5 = await create_cover_attachment(
        "last_light", COVERS_SVG["last_light"], "after_last_light_cover.svg", db
    )
    p5 = ProjectModel(
        title="After the Last Light",
        author="Samuel Rook",
        owner=user.handle,
        source="RTF",
        status=ProjectStatus.IN_PRODUCTION.value,
        language="English",
        genre="Suspense",
        thumbnail_attachment_id=cover5.id,
        user_id=user.id,
        created_at=now - timedelta(days=18),
        updated_at=now - timedelta(days=15),
    )
    db.add(p5)

    # 6. The Wild Index
    cover6 = await create_cover_attachment(
        "wild_index", COVERS_SVG["wild_index"], "the_wild_index_cover.svg", db
    )
    p6 = ProjectModel(
        title="The Wild Index",
        author="Leonie Hart",
        owner=user.handle,
        source="PDF",
        status=ProjectStatus.COMPLETE.value,
        language="English",
        genre="Natural History",
        thumbnail_attachment_id=cover6.id,
        user_id=user.id,
        created_at=now - timedelta(days=22),
        updated_at=now - timedelta(days=19),
    )
    db.add(p6)

    await db.flush()
    logger.info("Successfully seeded 6 design-matching projects!")
