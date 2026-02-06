"""Tests for vocabulary service."""
from pathlib import Path

import pytest

from app.services.vocabulary import (
    VocabularyEntry,
    load_vocabulary,
    filter_by_level,
    get_theme_for_word,
    cluster_into_chapters,
    build_course_structure,
)


# Sample vocabulary data for testing
SAMPLE_VOCAB = [
    VocabularyEntry(
        simplified="爱",
        traditional="愛",
        pinyin="ài",
        meanings=["to love"],
        level=1,
        frequency=130,
        pos=["v"],
    ),
    VocabularyEntry(
        simplified="吃",
        traditional="吃",
        pinyin="chī",
        meanings=["to eat"],
        level=1,
        frequency=200,
        pos=["v"],
    ),
    VocabularyEntry(
        simplified="家",
        traditional="家",
        pinyin="jiā",
        meanings=["home", "family"],
        level=1,
        frequency=100,
        pos=["n"],
    ),
    VocabularyEntry(
        simplified="学习",
        traditional="學習",
        pinyin="xué xí",
        meanings=["to study"],
        level=2,
        frequency=300,
        pos=["v"],
    ),
    VocabularyEntry(
        simplified="认识",
        traditional="認識",
        pinyin="rèn shi",
        meanings=["to know", "to recognize"],
        level=3,
        frequency=400,
        pos=["v"],
    ),
]


class TestVocabularyEntry:
    """Tests for VocabularyEntry dataclass."""
    
    def test_entry_creation(self):
        """Test creating a vocabulary entry."""
        entry = VocabularyEntry(
            simplified="好",
            traditional="好",
            pinyin="hǎo",
            meanings=["good"],
            level=1,
            frequency=50,
            pos=["a"],
        )
        assert entry.simplified == "好"
        assert entry.level == 1
        assert "good" in entry.meanings


class TestFilterByLevel:
    """Tests for level filtering."""
    
    def test_filter_level_1(self):
        """Filter vocabulary by HSK level 1."""
        result = filter_by_level(SAMPLE_VOCAB, 1)
        assert len(result) == 3
        assert all(e.level == 1 for e in result)
    
    def test_filter_level_2(self):
        """Filter vocabulary by HSK level 2."""
        result = filter_by_level(SAMPLE_VOCAB, 2)
        assert len(result) == 1
        assert result[0].simplified == "学习"
    
    def test_filter_nonexistent_level(self):
        """Filter by level with no words returns empty."""
        result = filter_by_level(SAMPLE_VOCAB, 7)
        assert len(result) == 0


class TestThemeDetection:
    """Tests for theme detection."""
    
    def test_detects_family_theme(self):
        """Test detecting family-related words."""
        assert get_theme_for_word("家") == "family"
        assert get_theme_for_word("爸爸") == "family"
        assert get_theme_for_word("妈妈") == "family"
    
    def test_detects_food_theme(self):
        """Test detecting food-related words."""
        assert get_theme_for_word("吃") == "food"
        assert get_theme_for_word("喝") == "food"
        assert get_theme_for_word("饭") == "food"
    
    def test_detects_study_theme(self):
        """Test detecting study-related words."""
        assert get_theme_for_word("学习") == "study"
        assert get_theme_for_word("学生") == "study"
    
    def test_no_theme_for_general_word(self):
        """Words without theme return None."""
        assert get_theme_for_word("非常") is None


class TestClusterIntoChapters:
    """Tests for chapter clustering."""
    
    def test_creates_chapters(self):
        """Test that clustering creates chapter structure."""
        chapters = cluster_into_chapters(SAMPLE_VOCAB, words_per_chapter=3)
        assert len(chapters) > 0
        assert all("vocabulary" in ch for ch in chapters)
        assert all("title" in ch for ch in chapters)
    
    def test_chapter_has_vocabulary_list(self):
        """Each chapter has vocabulary words."""
        chapters = cluster_into_chapters(SAMPLE_VOCAB, words_per_chapter=3)
        for chapter in chapters:
            assert isinstance(chapter["vocabulary"], list)
            assert len(chapter["vocabulary"]) >= 1
    
    def test_chapters_are_ordered(self):
        """Chapters have sequential order."""
        chapters = cluster_into_chapters(SAMPLE_VOCAB, words_per_chapter=2)
        orders = [ch["order"] for ch in chapters]
        assert orders == sorted(orders)


class TestBuildCourseStructure:
    """Tests for course structure building."""
    
    def test_course_has_required_fields(self):
        """Course structure has all required fields."""
        # Skip if no vocab file
        vocab_path = Path(__file__).parent.parent / "hsk_vocabulary.json"
        if not vocab_path.exists():
            vocab_path = Path(__file__).parent.parent.parent / "hsk_vocabulary.json"
        
        if not vocab_path.exists():
            pytest.skip("Vocabulary file not found")
        
        course = build_course_structure(vocab_path, 1)
        
        assert "level" in course
        assert "title" in course
        assert "description" in course
        assert "chapters" in course
        assert course["level"] == 1
    
    def test_course_level_in_title(self):
        """Course title includes HSK level."""
        vocab_path = Path(__file__).parent.parent / "hsk_vocabulary.json"
        if not vocab_path.exists():
            vocab_path = Path(__file__).parent.parent.parent / "hsk_vocabulary.json"
        
        if not vocab_path.exists():
            pytest.skip("Vocabulary file not found")
        
        course = build_course_structure(vocab_path, 2)
        assert "2" in course["title"]
