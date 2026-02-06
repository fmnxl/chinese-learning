"""LLM service for generating reading passages and questions."""
import json
from dataclasses import dataclass

import httpx

from app.config import get_settings

settings = get_settings()


@dataclass
class GeneratedPassage:
    """A generated reading passage with annotations."""
    title: str
    chinese_text: str
    sentences: list[dict]
    english_summary: str


PASSAGE_SYSTEM_PROMPT = """You are a Chinese language teaching expert creating graded reading materials.

You generate short reading passages for HSK learners that:
1. Use ONLY words from the provided vocabulary list (strictly enforced)
2. Include ALL target vocabulary words at least once
3. Are appropriate for the specified HSK level
4. Follow natural Chinese grammar and sentence structure
5. Are engaging and culturally relevant

Output ONLY valid JSON, no markdown or explanation."""

PASSAGE_USER_TEMPLATE = """Generate a short reading passage for HSK Level {level} learners.

## Target Vocabulary (MUST use ALL)
{target_vocab}

## Known Vocabulary (may use)
{known_vocab}

## Theme
{theme}

## Format
{format}

## Output Format
Return a JSON object with this structure:
{{
  "title": "Chinese title",
  "sentences": [
    {{
      "chinese": "Chinese sentence",
      "pinyin": "Pinyin with tone marks",
      "english": "English translation"
    }}
  ],
  "english_summary": "Brief English summary of the passage"
}}

Generate 3-5 sentences. Make it natural and engaging."""


async def generate_passage(
    level: int,
    target_vocab: list[str],
    known_vocab: list[str],
    theme: str = "daily life",
    format: str = "narrative",
) -> GeneratedPassage:
    """
    Generate a reading passage using LLM.
    
    Args:
        level: HSK level (1-7)
        target_vocab: Words that MUST appear in the passage
        known_vocab: Additional words that may be used
        theme: Topic/theme for the passage
        format: 'narrative' or 'dialogue'
    
    Returns:
        GeneratedPassage with structured content
    """
    if not settings.openrouter_api_key:
        raise ValueError("OpenRouter API key not configured")
    
    prompt = PASSAGE_USER_TEMPLATE.format(
        level=level,
        target_vocab=", ".join(target_vocab),
        known_vocab=", ".join(known_vocab[:50]),  # Limit context size
        theme=theme,
        format=format,
    )
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.openrouter_model,
                "messages": [
                    {"role": "system", "content": PASSAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.7,
                "max_tokens": 2000,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        result = response.json()
    
    # Parse LLM response
    content = result["choices"][0]["message"]["content"]
    data = json.loads(content)
    
    # Build full Chinese text from sentences
    chinese_text = "".join(s["chinese"] for s in data["sentences"])
    
    return GeneratedPassage(
        title=data["title"],
        chinese_text=chinese_text,
        sentences=data["sentences"],
        english_summary=data["english_summary"],
    )


def validate_passage(
    passage: GeneratedPassage,
    target_vocab: list[str],
    known_vocab: list[str],
) -> tuple[bool, list[str]]:
    """
    Validate that a passage uses required vocabulary.
    
    Returns:
        (is_valid, list of missing target words)
    """
    text = passage.chinese_text
    missing = [word for word in target_vocab if word not in text]
    return len(missing) == 0, missing


QUESTION_SYSTEM_PROMPT = """You are a Chinese language teaching expert creating comprehension questions.

Generate questions that test:
1. Vocabulary understanding (word meanings in context)
2. Reading comprehension (factual and inference)
3. Grammar patterns

Output ONLY valid JSON."""

QUESTION_USER_TEMPLATE = """Generate comprehension questions for this HSK Level {level} reading passage.

## Passage
{passage}

## Target Vocabulary
{target_vocab}

## Question Requirements
- 3 vocabulary questions (test word meanings)
- 2 comprehension questions (test understanding of content)

## Output Format
{{
  "questions": [
    {{
      "type": "vocabulary" | "comprehension",
      "question_chinese": "Question in Chinese",
      "question_english": "Question in English",
      "options": ["A", "B", "C", "D"],
      "correct_answer": 0,
      "explanation": "Why this is correct"
    }}
  ]
}}"""


async def generate_questions(
    level: int,
    passage: GeneratedPassage,
    target_vocab: list[str],
) -> list[dict]:
    """Generate comprehension questions for a passage."""
    if not settings.openrouter_api_key:
        raise ValueError("OpenRouter API key not configured")
    
    prompt = QUESTION_USER_TEMPLATE.format(
        level=level,
        passage=passage.chinese_text,
        target_vocab=", ".join(target_vocab),
    )
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.openrouter_model,
                "messages": [
                    {"role": "system", "content": QUESTION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.7,
                "max_tokens": 2000,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        result = response.json()
    
    content = result["choices"][0]["message"]["content"]
    data = json.loads(content)
    
    return data["questions"]
