import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env")


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

from app.models.meeting_model import Meeting

def get_db():
    """Provide database session dependency."""
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

def create_database_tables():
    """Create database tables."""
    Base.metadata.create_all(bind=engine)