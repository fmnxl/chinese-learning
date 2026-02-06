"""Vocabulary service for loading and clustering HSK words."""
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class VocabularyEntry:
    """A single vocabulary word."""
    simplified: str
    traditional: str
    pinyin: str
    meanings: list[str]
    level: int  # HSK 1-7
    frequency: int
    pos: list[str]


# Semantic theme categories for chapter grouping
THEMES = {
    "greetings": ["你", "好", "再见", "早", "晚", "请", "谢谢", "对不起", "没关系"],
    "family": ["爸爸", "妈妈", "家", "儿子", "女儿", "哥哥", "姐姐", "弟弟", "妹妹", "孩子", "父", "母", "亲"],
    "food": ["吃", "喝", "饭", "菜", "水", "茶", "肉", "鱼", "蛋", "果", "苹果", "米", "面"],
    "time": ["今天", "明天", "昨天", "年", "月", "日", "星期", "小时", "分钟", "现在", "时候", "早上", "晚上"],
    "numbers": ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千", "万", "几", "多少"],
    "places": ["中国", "北京", "学校", "医院", "商店", "饭店", "机场", "公司", "银行"],
    "transport": ["车", "出租车", "公共汽车", "飞机", "火车", "地铁", "走", "坐", "开"],
    "work": ["工作", "上班", "公司", "老板", "同事", "会议", "办公室"],
    "shopping": ["买", "卖", "钱", "块", "便宜", "贵", "商店", "超市"],
    "weather": ["天气", "热", "冷", "下雨", "晴", "风", "雪"],
    "health": ["身体", "医院", "医生", "药", "病", "头", "疼"],
    "study": ["学习", "学生", "老师", "书", "课", "考试", "问题", "回答"],
    "emotions": ["高兴", "快乐", "难过", "生气", "喜欢", "爱", "怕", "担心"],
    "actions": ["做", "看", "听", "说", "写", "读", "想", "知道", "给", "用"],
    "descriptions": ["大", "小", "高", "矮", "长", "短", "好", "坏", "新", "旧", "快", "慢"],
}


def load_vocabulary(json_path: str | Path) -> list[VocabularyEntry]:
    """Load vocabulary from HSK JSON file."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    entries = []
    for item in data:
        # Extract HSK level (prefer new HSK system)
        levels = item.get("level", [])
        hsk_level = 7  # Default to advanced if not specified
        for lvl in levels:
            if lvl.startswith("new-"):
                hsk_level = min(hsk_level, int(lvl.replace("new-", "")))
        
        # Get first form's data
        forms = item.get("forms", [])
        if not forms:
            continue
        
        first_form = forms[0]
        transcriptions = first_form.get("transcriptions", {})
        
        entries.append(VocabularyEntry(
            simplified=item["simplified"],
            traditional=first_form.get("traditional", item["simplified"]),
            pinyin=transcriptions.get("pinyin", ""),
            meanings=first_form.get("meanings", []),
            level=hsk_level,
            frequency=item.get("frequency", 99999),
            pos=item.get("pos", []),
        ))
    
    return entries


def filter_by_level(entries: list[VocabularyEntry], level: int) -> list[VocabularyEntry]:
    """Get vocabulary for a specific HSK level."""
    return [e for e in entries if e.level == level]


def get_theme_for_word(word: str) -> str | None:
    """Check if a word belongs to a known theme."""
    for theme, keywords in THEMES.items():
        for keyword in keywords:
            if keyword in word or word in keyword:
                return theme
    return None


def cluster_into_chapters(
    entries: list[VocabularyEntry],
    words_per_chapter: int = 20,
) -> list[dict]:
    """
    Cluster vocabulary into chapters by frequency and semantic themes.
    
    Strategy:
    1. Sort by frequency (most common first)
    2. Group by detected themes where possible
    3. Remaining words grouped by frequency bands
    """
    # Sort by frequency
    sorted_entries = sorted(entries, key=lambda e: e.frequency)
    
    # First pass: group by theme
    themed_groups: dict[str, list[VocabularyEntry]] = {}
    unthemed: list[VocabularyEntry] = []
    
    for entry in sorted_entries:
        theme = get_theme_for_word(entry.simplified)
        if theme:
            if theme not in themed_groups:
                themed_groups[theme] = []
            themed_groups[theme].append(entry)
        else:
            unthemed.append(entry)
    
    # Build chapters
    chapters = []
    chapter_num = 1
    
    # First, add themed chapters (if they have enough words)
    for theme, words in themed_groups.items():
        if len(words) >= 5:  # Only make a theme chapter if 5+ words
            chapters.append({
                "order": chapter_num,
                "title": f"Chapter {chapter_num}: {theme.title()}",
                "theme": theme,
                "vocabulary": [w.simplified for w in words[:words_per_chapter]],
            })
            chapter_num += 1
            # Add remaining to unthemed
            unthemed.extend(words[words_per_chapter:])
    
    # Then add remaining words in frequency-based chapters
    unthemed = sorted(unthemed, key=lambda e: e.frequency)
    for i in range(0, len(unthemed), words_per_chapter):
        chunk = unthemed[i:i + words_per_chapter]
        if len(chunk) >= 5:  # Only create chapter if 5+ words
            chapters.append({
                "order": chapter_num,
                "title": f"Chapter {chapter_num}: Mixed Vocabulary",
                "theme": "general",
                "vocabulary": [w.simplified for w in chunk],
            })
            chapter_num += 1
    
    return chapters


def build_course_structure(
    vocab_path: str | Path,
    level: int,
) -> dict:
    """
    Build complete course structure for an HSK level.
    
    Returns course dict with chapters and vocabulary.
    """
    entries = load_vocabulary(vocab_path)
    level_entries = filter_by_level(entries, level)
    
    # Determine words per chapter based on level
    words_per_chapter = {
        1: 15,
        2: 18,
        3: 20,
        4: 25,
        5: 30,
        6: 35,
        7: 40,
    }.get(level, 20)
    
    chapters = cluster_into_chapters(level_entries, words_per_chapter)
    
    return {
        "level": level,
        "title": f"HSK {level}",
        "description": f"Complete HSK Level {level} course with {len(level_entries)} vocabulary words across {len(chapters)} chapters.",
        "total_vocabulary": len(level_entries),
        "chapters": chapters,
    }
