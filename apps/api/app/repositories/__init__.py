"""
Repository package providing database data-access abstractions.
"""

from app.repositories.base import BaseRepository
from app.repositories.candidate import CandidateRepository

__all__ = ["BaseRepository", "CandidateRepository"]
