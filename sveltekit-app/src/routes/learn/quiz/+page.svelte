<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { loadData, type Character, type Word } from '$lib/data/loader';
	import {
		quizConfig,
		quizSession,
		currentCard,
		sessionProgress,
		sessionStats,
		reviewQueueStats,
		GRADE_OPTIONS,
		FREQUENCY_OPTIONS,
		type QuizMode,
		type QuizSource,
		type AnswerMode,
		type CharacterScript,
		type ItemTypeFilter,
		getValidAnswerModes
	} from '$lib/srs/quiz';
	import { formatInterval, getLearningStage, getStageColor } from '$lib/srs/sm2';
	import {
		gradeAnswer,
		normalizePinyin as gradingNormalizePinyin,
		type GradingResult
	} from '$lib/srs/grading';
	import { studyList, studyListStats, isInStudyList } from '$lib/stores/studyList';

	let showSetup = true;
	let cardData: Character | Word | null = null;
	let isLoading = true;
	let allData: Awaited<ReturnType<typeof loadData>> | null = null;

	// Source selection state
	let selectedGrade = GRADE_OPTIONS[0];
	let selectedFrequency = FREQUENCY_OPTIONS[0];
	let availableCharCount = 0;

	// Multiple choice state
	let choiceOptions: { text: string; isCorrect: boolean }[] = [];
	let selectedChoice: number | null = null;
	let choiceSubmitted = false;

	// Typing input state
	let typingAnswer = '';
	let typingSubmitted = false;
	let typingCorrect = false;

	// Tone selection state for pronunciation mode
	let selectedTone: number | null = null;
	let toneCorrect = false;

	// Response time tracking for automatic grading
	let cardStartTime: number = 0;
	let lastGradingResult: GradingResult | null = null;

	// Pending continue state (after answering, wait for user to click Continue)
	let pendingContinue: { quality: number; wasCorrect: boolean } | null = null;

	// Timer display
	let elapsedTime: number = 0;
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	// Time thresholds (in ms) based on base reading time (2s + 0.3s * 1 char = 2.3s)
	// ratio 1.5 = 3.45s, ratio 3 = 6.9s, ratio 5 = 11.5s
	const TIME_THRESHOLDS = {
		green: 3500,   // Fast/confident
		yellow: 7000,  // Normal
		orange: 12000  // Slow (above this is very slow/red)
	};

	function startTimer() {
		if (timerInterval) clearInterval(timerInterval);
		elapsedTime = 0;
		timerInterval = setInterval(() => {
			elapsedTime = Date.now() - cardStartTime;
		}, 100);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function getTimerColor(ms: number): string {
		if (ms < TIME_THRESHOLDS.green) return 'timer-green';
		if (ms < TIME_THRESHOLDS.yellow) return 'timer-yellow';
		if (ms < TIME_THRESHOLDS.orange) return 'timer-orange';
		return 'timer-red';
	}

	function formatTimer(ms: number): string {
		const seconds = ms / 1000;
		return seconds.toFixed(1) + 's';
	}

	// Config options
	const deckSizes = [5, 10, 20, 50];
	const modes: { value: QuizMode; label: string; description: string }[] = [
		{ value: 'recognition', label: 'Recognition', description: 'See character → guess meaning' },
		{ value: 'recall', label: 'Recall', description: 'See meaning → guess character' },
		{ value: 'pronunciation', label: 'Pronunciation', description: 'See character + meaning → type pinyin' }
	];

	const answerModes: { value: AnswerMode; label: string; description: string }[] = [
		{ value: 'self_rate', label: 'Self-Rate', description: 'Reveal answer, rate yourself' },
		{ value: 'multiple_choice', label: 'Multiple Choice', description: 'Pick from 4 options' },
		{ value: 'typing', label: 'Type Answer', description: 'Type pinyin or character' }
	];

	// Filter valid answer modes based on selected quiz mode
	$: validAnswerModeValues = getValidAnswerModes($quizConfig.mode);
	$: filteredAnswerModes = answerModes.filter(m => validAnswerModeValues.includes(m.value));

	// Auto-switch to valid answer mode if current selection is invalid
	$: {
		if (!validAnswerModeValues.includes($quizConfig.answerMode)) {
			quizConfig.setAnswerMode(validAnswerModeValues[0]);
		}
	}

	const scriptOptions: { value: CharacterScript; label: string }[] = [
		{ value: 'simplified', label: '简 Simplified' },
		{ value: 'traditional', label: '繁 Traditional' },
		{ value: 'both', label: 'Both' }
	];

	const itemTypeOptions: { value: ItemTypeFilter; label: string }[] = [
		{ value: 'characters', label: '字 Characters' },
		{ value: 'words', label: '词 Words' },
		{ value: 'both', label: 'Both' }
	];

	const sourceTabs = [
		{ type: 'study_list' as const, label: '📚 Study List', icon: '📚' },
		{ type: 'grade' as const, label: '🎓 By HSK', icon: '🎓' },
		{ type: 'frequency' as const, label: '📈 By Frequency', icon: '📈' }
	];

	onMount(async () => {
		allData = await loadData();
		isLoading = false;
		updateAvailableCount();
	});

	function updateAvailableCount() {
		if (!allData) return;
		
		if ($quizConfig.source.type === 'grade') {
			const chars = getCharactersByGrade(selectedGrade.min, selectedGrade.max);
			availableCharCount = chars.length;
		} else if ($quizConfig.source.type === 'frequency') {
			const chars = getCharactersByFrequency(selectedFrequency.min, selectedFrequency.max);
			availableCharCount = chars.length;
		}
	}

	// Check if character matches script filter
	// Logic: 
	// - Simplified: show characters that are valid in simplified Chinese
	//   (characters without a traditional variant, or those that ARE simplified forms)
	// - Traditional: show characters that are valid in traditional Chinese
	//   (characters without a simplified variant, or those that ARE traditional forms)
	// Most characters (一, 二, 人, 大) are shared - they appear for BOTH filters
	function matchesScriptFilter(char: { simplified?: string | null; traditional?: string | null }, charId: string): boolean {
		const script = $quizConfig.scriptFilter;
		if (script === 'both') return true;
		
		if (script === 'simplified') {
			// Valid in simplified: no traditional variant OR traditional is same as this char
			// Exclude: characters that ARE traditional forms (have a different simplified)
			if (char.simplified && char.simplified !== charId) {
				// This character HAS a simplified variant that's different = it's a traditional form
				return false;
			}
			return true;
		} else {
			// Valid in traditional: no simplified variant OR simplified is same as this char
			// Exclude: characters that ARE simplified forms (have a different traditional)
			if (char.traditional && char.traditional !== charId) {
				// This character HAS a traditional variant that's different = it's a simplified form
				return false;
			}
			return true;
		}
	}

	function getCharactersByGrade(minGrade: number, maxGrade: number): string[] {
		if (!allData) return [];
		return Object.entries(allData.characters)
			.filter(([charId, char]) => {
				const grade = char.gradeLevel ?? 99;
				const gradeMatch = grade >= minGrade && grade <= maxGrade;
				return gradeMatch && matchesScriptFilter(char, charId);
			})
			.map(([char]) => char);
	}

	function getCharactersByFrequency(minRank: number, maxRank: number): string[] {
		if (!allData) return [];
		return Object.entries(allData.characters)
			.filter(([charId, char]) => {
				const freq = char.charFrequency ?? 99999;
				const freqMatch = freq >= minRank && freq <= maxRank;
				return freqMatch && matchesScriptFilter(char, charId);
			})
			.map(([char]) => char);
	}

	async function loadCardData() {
		if (!$currentCard || !allData) return;
		const item = $currentCard.item;
		
		if (item.type === 'character') {
			const char = allData.characters[item.id];
			cardData = char ? { ...char, char: item.id } as Character : null;
		} else {
			const word = allData.words[item.id];
			cardData = word ? { ...word, word: item.id } as Word : null;
		}

		// Generate multiple choice options if needed
		if ($quizConfig.answerMode === 'multiple_choice' && cardData) {
			generateChoiceOptions();
		}

		// Reset input state
		selectedChoice = null;
		choiceSubmitted = false;
		typingAnswer = '';
		typingSubmitted = false;
		typingCorrect = false;
		selectedTone = null;
		toneCorrect = false;
		lastGradingResult = null;
		
		// Start response timer for automatic grading
		cardStartTime = Date.now();
		startTimer();
	}

	function generateChoiceOptions() {
		if (!allData || !cardData) return;
		
		const mode = $quizConfig.mode;
		const correctAnswer = mode === 'recognition' 
			? (cardData.definition || 'Unknown')
			: ($currentCard?.item.id || '');
		
		// Filter characters by the same source settings as the quiz
		let filteredChars = Object.entries(allData.characters);
		
		if ($quizConfig.source.type === 'grade') {
			const gradeMin = $quizConfig.source.gradeMin ?? 1;
			const gradeMax = $quizConfig.source.gradeMax ?? 6;
			filteredChars = filteredChars.filter(([, data]) => {
				const grade = data.gradeLevel ?? 99;
				return grade >= gradeMin && grade <= gradeMax;
			});
		} else if ($quizConfig.source.type === 'frequency') {
			const freqMin = $quizConfig.source.freqMin ?? 1;
			const freqMax = $quizConfig.source.freqMax ?? 500;
			filteredChars = filteredChars.filter(([, data]) => {
				const freq = data.charFrequency ?? 99999;
				return freq >= freqMin && freq <= freqMax;
			});
		}
		
		// Get random distractors from filtered pool
		const distractors: string[] = [];
		const usedAnswers = new Set([correctAnswer]);
		
		// First try to get distractors from the filtered pool
		let charPool = [...filteredChars];
		while (distractors.length < 3 && charPool.length > 0) {
			const randomIndex = Math.floor(Math.random() * charPool.length);
			const [char, data] = charPool[randomIndex];
			const distractor = mode === 'recognition' 
				? (data.definition || 'Unknown')
				: char;
			
			if (!usedAnswers.has(distractor) && distractor !== 'Unknown') {
				distractors.push(distractor);
				usedAnswers.add(distractor);
			}
			charPool.splice(randomIndex, 1);
		}
		
		// Fallback: if not enough distractors from grade, use all characters
		if (distractors.length < 3) {
			charPool = Object.entries(allData.characters).filter(
				([char]) => !usedAnswers.has(char)
			);
			while (distractors.length < 3 && charPool.length > 0) {
				const randomIndex = Math.floor(Math.random() * charPool.length);
				const [char, data] = charPool[randomIndex];
				const distractor = mode === 'recognition' 
					? (data.definition || 'Unknown')
					: char;
				
				if (!usedAnswers.has(distractor) && distractor !== 'Unknown') {
					distractors.push(distractor);
					usedAnswers.add(distractor);
				}
				charPool.splice(randomIndex, 1);
			}
		}

		// Shuffle options
		const options = [
			{ text: correctAnswer, isCorrect: true },
			...distractors.map(d => ({ text: d, isCorrect: false }))
		];
		
		for (let i = options.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[options[i], options[j]] = [options[j], options[i]];
		}
		
		choiceOptions = options;
	}

	function selectChoiceOption(index: number) {
		if (choiceSubmitted) return;
		selectedChoice = index;
	}

	async function submitChoice() {
		if (selectedChoice === null) return;
		choiceSubmitted = true;
		
		const isCorrect = choiceOptions[selectedChoice]?.isCorrect ?? false;
		const responseTimeMs = Date.now() - cardStartTime;
		
		// Grade the answer using automatic grading
		const result = await gradeAnswer({
			answerMode: 'multiple_choice',
			questionType: $quizConfig.mode === 'pronunciation' ? 'recognition' : $quizConfig.mode,
			correctAnswer: cardData?.pinyin || '',
			userAnswer: isCorrect ? (cardData?.pinyin || '') : 'wrong',
			responseTimeMs,
			questionCharCount: 1
		});
		lastGradingResult = result;
		
		// Wait for user to click Continue
		stopTimer();
		pendingContinue = { quality: result.sm2Quality, wasCorrect: isCorrect };
	}
	
	async function skipChoice() {
		// "I don't know" - treat as failure
		choiceSubmitted = true;
		selectedChoice = null;
		
		const responseTimeMs = Date.now() - cardStartTime;
		
		// Grade as skipped
		const result = await gradeAnswer({
			answerMode: 'multiple_choice',
			questionType: $quizConfig.mode === 'pronunciation' ? 'recognition' : $quizConfig.mode,
			correctAnswer: cardData?.pinyin || '',
			userAnswer: null, // null = "I don't know"
			responseTimeMs,
			questionCharCount: 1
		});
		lastGradingResult = result;
		
		// Wait for user to click Continue
		stopTimer();
		pendingContinue = { quality: result.sm2Quality, wasCorrect: false };
	}

	function skipTyping() {
		// "I don't know" - treat as failure for typing mode
		typingSubmitted = true;
		typingCorrect = false;
		toneCorrect = false;
		
		// Wait for user to click Continue
		stopTimer();
		pendingContinue = { quality: 0, wasCorrect: false };
	}

	// Pinyin tone marker to number mapping
	const toneMarkerMap: Record<string, [string, string]> = {
		// Tone 1
		'ā': ['a', '1'], 'ē': ['e', '1'], 'ī': ['i', '1'], 'ō': ['o', '1'], 'ū': ['u', '1'], 'ǖ': ['v', '1'],
		// Tone 2
		'á': ['a', '2'], 'é': ['e', '2'], 'í': ['i', '2'], 'ó': ['o', '2'], 'ú': ['u', '2'], 'ǘ': ['v', '2'],
		// Tone 3
		'ǎ': ['a', '3'], 'ě': ['e', '3'], 'ǐ': ['i', '3'], 'ǒ': ['o', '3'], 'ǔ': ['u', '3'], 'ǚ': ['v', '3'],
		// Tone 4
		'à': ['a', '4'], 'è': ['e', '4'], 'ì': ['i', '4'], 'ò': ['o', '4'], 'ù': ['u', '4'], 'ǜ': ['v', '4'],
		// Tone 5 (neutral) - no marker typically
	};

	// Convert pinyin with tone markers to numbered pinyin (zhī → zhi1)
	function toneMarkersToNumbers(pinyin: string): string {
		let result = '';
		let tone = '';
		
		for (const char of pinyin) {
			if (toneMarkerMap[char]) {
				const [base, toneNum] = toneMarkerMap[char];
				result += base;
				tone = toneNum;
			} else if (char.match(/[a-zA-Z]/)) {
				result += char.toLowerCase();
			} else if (char.match(/[1-5]/)) {
				// Already numbered - append directly
				result += char;
			} else if (char === ' ') {
				// Space between syllables - append tone before space
				if (tone) {
					result += tone;
					tone = '';
				}
				result += ' ';
			}
		}
		
		// Append final tone if any
		if (tone) {
			result += tone;
		}
		
		return result;
	}

	// Normalize pinyin for comparison (handles both formats)
	function normalizePinyin(pinyin: string): string {
		// Convert tone markers to numbers
		let normalized = toneMarkersToNumbers(pinyin);
		// Remove spaces and convert to lowercase
		normalized = normalized.toLowerCase().replace(/\s+/g, '');
		// Handle ü → v conversion
		normalized = normalized.replace(/ü/g, 'v');
		return normalized;
	}

	function checkTypingAnswer() {
		if (!cardData || typingSubmitted) return;
		typingSubmitted = true;
		
		const mode = $quizConfig.mode;
		
		// Determine what the correct answer should be based on mode:
		// - recognition: meaning/definition (user sees character, guesses meaning)
		// - recall: character (user sees meaning, guesses character)
		// - pronunciation: pinyin base + tone (user sees char+meaning, guesses pinyin)
		let correctAnswer: string;
		let userAnswer: string;
		
		if (mode === 'pronunciation') {
			// Pronunciation mode: validate pinyin base + selected tone
			const correctPinyin = cardData.pinyin || '';
			const normalizedCorrect = normalizePinyin(correctPinyin);
			
			// Extract correct tone number (last digit or 5 for neutral)
			const correctToneMatch = normalizedCorrect.match(/[1-5]$/);
			const correctTone = correctToneMatch ? parseInt(correctToneMatch[0]) : 5;
			const correctBase = normalizedCorrect.replace(/[1-5]/g, '');
			
			// User input: pinyin base from text field + selected tone from buttons
			const userBase = normalizePinyin(typingAnswer).replace(/[1-5]/g, '');
			const userTone = selectedTone ?? 5;
			
			// Check if pinyin base is correct
			typingCorrect = userBase === correctBase;
			
			// Check if tone is correct
			toneCorrect = userTone === correctTone;
			
			// Quality scoring:
			// - Both correct: quality 4 (good)
			// - Pinyin correct, tone wrong: quality 2 (partial - penalized)
			// - Pinyin wrong: quality 0 (fail)
			let quality = 0;
			if (typingCorrect && toneCorrect) {
				quality = 4;
			} else if (typingCorrect && !toneCorrect) {
				quality = 2; // Penalized for wrong tone
			}
			
			// Overall correctness: both must be right for full credit
			const fullyCorrect = typingCorrect && toneCorrect;
			
			stopTimer();
			pendingContinue = { quality, wasCorrect: fullyCorrect };
			return;
		} else if (mode === 'recognition') {
			// Recognition mode: compare meaning/definition (case-insensitive partial match)
			const correctDef = (cardData.definition || '').toLowerCase().trim();
			userAnswer = typingAnswer.toLowerCase().trim();
			
			// Accept if user's answer is contained in the correct definition
			// or if the correct definition contains the user's answer
			typingCorrect = correctDef.includes(userAnswer) || 
				userAnswer.includes(correctDef) ||
				correctDef === userAnswer;
		} else {
			// Recall mode: exact character match
			correctAnswer = $currentCard?.item.id || '';
			userAnswer = typingAnswer.trim();
			typingCorrect = userAnswer === correctAnswer;
		}
		
		// Wait for user to click Continue
		stopTimer();
		pendingContinue = { quality: typingCorrect ? 4 : 0, wasCorrect: typingCorrect };
	}

	function continueToNext() {
		if (!pendingContinue) return;
		quizSession.submitWithQuality(pendingContinue.quality as 0 | 1 | 2 | 3 | 4 | 5, pendingContinue.wasCorrect);
		pendingContinue = null;
		loadCardData();
	}

	function setSourceType(type: 'study_list' | 'grade' | 'frequency') {
		let source: QuizSource = { type };
		if (type === 'grade') {
			source = { type, gradeMin: selectedGrade.min, gradeMax: selectedGrade.max };
		} else if (type === 'frequency') {
			source = { type, freqMin: selectedFrequency.min, freqMax: selectedFrequency.max };
		}
		quizConfig.setSource(source);
		updateAvailableCount();
	}

	function selectGrade(grade: typeof GRADE_OPTIONS[0]) {
		selectedGrade = grade;
		quizConfig.setSource({ type: 'grade', gradeMin: grade.min, gradeMax: grade.max });
		updateAvailableCount();
	}

	function selectFrequency(freq: typeof FREQUENCY_OPTIONS[0]) {
		selectedFrequency = freq;
		quizConfig.setSource({ type: 'frequency', freqMin: freq.min, freqMax: freq.max });
		updateAvailableCount();
	}

	function startQuiz() {
		const source = $quizConfig.source;

		if (source.type === 'study_list') {
			quizSession.startSession($quizConfig);
		} else if (source.type === 'grade') {
			const chars = getCharactersByGrade(source.gradeMin ?? 1, source.gradeMax ?? 1);
			quizSession.startWithItems(chars, $quizConfig);
		} else if (source.type === 'frequency') {
			const chars = getCharactersByFrequency(source.freqMin ?? 1, source.freqMax ?? 100);
			quizSession.startWithItems(chars, $quizConfig);
		}

		showSetup = false;
		loadCardData();
	}

	function revealCard() {
		quizSession.reveal();
	}

	function submitRating(rating: 'again' | 'hard' | 'good' | 'easy') {
		stopTimer();
		quizSession.submitRating(rating);
		loadCardData();
	}

	function restartQuiz() {
		showSetup = true;
		quizSession.reset();
	}

	function goBack() {
		goto('/');
	}

	function getStartButtonText(): string {
		const source = $quizConfig.source;
		if (source.type === 'study_list') {
			return `Start Quiz (${Math.min($quizConfig.deckSize, $studyListStats.total)} cards)`;
		}
		return `Start Quiz (${Math.min($quizConfig.deckSize, availableCharCount)} cards)`;
	}

	function canStart(): boolean {
		const source = $quizConfig.source;
		if (source.type === 'study_list') {
			return $studyListStats.total > 0;
		}
		return availableCharCount > 0;
	}

	// Reactive card data loading
	$: if ($currentCard) {
		loadCardData();
	}
</script>

<svelte:head>
	<title>Quiz | Chinese Radicals</title>
</svelte:head>

<div class="quiz-container">
	{#if isLoading}
		<div class="loading">Loading...</div>
	{:else if showSetup}
		<!-- Quiz Setup Screen -->
		<div class="setup">
			<h1>📚 Study Quiz</h1>

			<!-- Source Tabs -->
			<div class="source-tabs">
				{#each sourceTabs as tab}
					<button
						class="source-tab"
						class:active={$quizConfig.source.type === tab.type}
						on:click={() => setSourceType(tab.type)}
					>
						{tab.label}
					</button>
				{/each}
			</div>

			<!-- Source-specific content -->
			{#if $quizConfig.source.type === 'study_list'}
				<div class="stats-overview">
					<div class="stat-card">
						<span class="stat-value">{$reviewQueueStats.due}</span>
						<span class="stat-label">Due for Review</span>
					</div>
					<div class="stat-card">
						<span class="stat-value">{$reviewQueueStats.newItems}</span>
						<span class="stat-label">New Items</span>
					</div>
					<div class="stat-card">
						<span class="stat-value">{$studyListStats.total}</span>
						<span class="stat-label">Total in List</span>
					</div>
				</div>

				<div class="source-selector">
					<h3>Item Type</h3>
					<div class="script-options">
						{#each itemTypeOptions as option}
							<button
								class="script-btn"
								class:active={$quizConfig.itemTypeFilter === option.value}
								on:click={() => quizConfig.setItemTypeFilter(option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				{#if $studyListStats.total === 0}
					<div class="empty-state">
						<p>Your study list is empty!</p>
						<p class="hint">Add some characters or words to your study list, or select a different source above.</p>
					</div>
				{/if}
			{:else if $quizConfig.source.type === 'grade'}
				<div class="source-selector">
					<h3>Character Script</h3>
					<div class="script-options">
						{#each scriptOptions as script}
							<button
								class="script-btn"
								class:active={$quizConfig.scriptFilter === script.value}
								on:click={() => { quizConfig.setScriptFilter(script.value); updateAvailableCount(); }}
							>
								{script.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="source-selector">
					<h3>Select Grade Level</h3>
					<div class="option-grid">
						{#each GRADE_OPTIONS as grade}
							<button
								class="option-btn"
								class:active={selectedGrade === grade}
								on:click={() => selectGrade(grade)}
							>
								{grade.label}
							</button>
						{/each}
					</div>
					<p class="source-info">
						{availableCharCount} characters available
					</p>
				</div>
			{:else if $quizConfig.source.type === 'frequency'}
				<div class="source-selector">
					<h3>Character Script</h3>
					<div class="script-options">
						{#each scriptOptions as script}
							<button
								class="script-btn"
								class:active={$quizConfig.scriptFilter === script.value}
								on:click={() => { quizConfig.setScriptFilter(script.value); updateAvailableCount(); }}
							>
								{script.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="source-selector">
					<h3>Select Frequency Range</h3>
					<div class="option-grid">
						{#each FREQUENCY_OPTIONS as freq}
							<button
								class="option-btn"
								class:active={selectedFrequency === freq}
								on:click={() => selectFrequency(freq)}
							>
								{freq.label}
							</button>
						{/each}
					</div>
					<p class="source-info">
						{availableCharCount} characters available
					</p>
				</div>
			{/if}

			<!-- Common config options -->
			{#if canStart() || $quizConfig.source.type !== 'study_list'}
				<div class="config-section">
					<h2>Quiz Mode</h2>
					<div class="mode-options">
						{#each modes as mode}
							<button
								class="mode-btn"
								class:active={$quizConfig.mode === mode.value}
								on:click={() => quizConfig.setMode(mode.value)}
							>
								<span class="mode-label">{mode.label}</span>
								<span class="mode-desc">{mode.description}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="config-section">
					<h2>Answer Method</h2>
					<div class="mode-options">
						{#each filteredAnswerModes as answerMode}
							<button
								class="mode-btn"
								class:active={$quizConfig.answerMode === answerMode.value}
								on:click={() => quizConfig.setAnswerMode(answerMode.value)}
							>
								<span class="mode-label">{answerMode.label}</span>
								<span class="mode-desc">{answerMode.description}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="config-section">
					<h2>Deck Size</h2>
					<div class="size-options">
						{#each deckSizes as size}
							<button
								class="size-btn"
								class:active={$quizConfig.deckSize === size}
								on:click={() => quizConfig.setDeckSize(size)}
							>
								{size}
							</button>
						{/each}
					</div>
				</div>

				{#if $quizConfig.source.type === 'study_list'}
					<div class="config-section">
						<label class="toggle-option">
							<input
								type="checkbox"
								checked={$quizConfig.includeNew}
								on:change={(e) => quizConfig.setIncludeNew(e.currentTarget.checked)}
							/>
							<span>Include new items (up to {$quizConfig.newCardsLimit} per session)</span>
						</label>
					</div>
				{/if}

				<button class="btn btn-primary btn-start" on:click={startQuiz} disabled={!canStart()}>
					{getStartButtonText()}
				</button>
			{/if}
		</div>
	{:else if $quizSession.isComplete}
		<!-- Results Screen -->
		<div class="results">
			<h1>🎉 Session Complete!</h1>
			
			<div class="results-stats">
				<div class="result-stat">
					<span class="result-value">{$sessionStats.totalReviewed}</span>
					<span class="result-label">Cards Reviewed</span>
				</div>
				<div class="result-stat correct">
					<span class="result-value">{$sessionStats.correct}</span>
					<span class="result-label">Correct</span>
				</div>
				<div class="result-stat incorrect">
					<span class="result-value">{$sessionStats.incorrect}</span>
					<span class="result-label">Again</span>
				</div>
				<div class="result-stat">
					<span class="result-value">{Math.round($sessionStats.averageTime / 1000)}s</span>
					<span class="result-label">Avg. Time</span>
				</div>
			</div>

			{#if $sessionStats.totalReviewed > 0}
				<div class="accuracy-bar">
					<div 
						class="accuracy-fill" 
						style="width: {($sessionStats.correct / $sessionStats.totalReviewed) * 100}%"
					></div>
				</div>
				<p class="accuracy-label">
					{Math.round(($sessionStats.correct / $sessionStats.totalReviewed) * 100)}% Accuracy
				</p>
			{/if}

			<div class="results-actions">
				<button class="btn btn-primary" on:click={restartQuiz}>
					Study Again
				</button>
				<button class="btn btn-secondary" on:click={goBack}>
					Back to Browse
				</button>
			</div>

			<!-- Results Review Section -->
			{#if $quizSession.results.length > 0}
				<div class="results-review">
					<h2>Review Your Answers</h2>
					<div class="results-list">
						{#each $quizSession.results as result}
							{@const charData = allData?.characters[result.item.id]}
							{@const inStudyList = $isInStudyList(result.item.type, result.item.id)}
							<div class="review-item" class:correct={result.wasCorrect} class:incorrect={!result.wasCorrect}>
								<div class="review-status">
									{#if result.wasCorrect}
										<span class="status-icon correct">✓</span>
									{:else}
										<span class="status-icon incorrect">✗</span>
									{/if}
								</div>
								<div class="review-character">{result.item.id}</div>
								<div class="review-details">
									<span class="review-pinyin">{charData?.pinyin || '—'}</span>
									<span class="review-definition">{charData?.definition || 'No definition'}</span>
								</div>
								<div class="review-rating">
									<span class="rating-badge {result.rating}">{result.rating}</span>
								</div>
								<div class="review-actions">
									{#if inStudyList}
										<button class="add-btn added" disabled title="Already in Study List">
											✓ In List
										</button>
									{:else}
										<button 
											class="add-btn" 
											on:click={() => studyList.addItem(result.item.type, result.item.id)}
											title="Add to Study List"
										>
											+ Add
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Quiz Card Screen -->
		<div class="quiz-screen">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {$sessionProgress.percentage}%"></div>
			</div>
			<div class="progress-info">
				<div class="progress-text">
					{$sessionProgress.current + 1} / {$sessionProgress.total}
				</div>
				{#if !$quizSession.isRevealed && !choiceSubmitted && !typingSubmitted}
					<div class="response-timer {getTimerColor(elapsedTime)}">
						<span class="timer-icon">⏱</span>
						<span class="timer-value">{formatTimer(elapsedTime)}</span>
					</div>
				{/if}
			</div>

			{#if $currentCard && cardData}
				<div class="card" class:revealed={$quizSession.isRevealed || choiceSubmitted || typingSubmitted}>
					<!-- Front of card (Question) -->
					<div class="card-front">
						{#if $quizConfig.mode === 'recognition'}
							<div class="card-question">
								<span class="big-character">{$currentCard.item.id}</span>
							</div>
							<p class="card-hint">What does this mean?</p>
						{:else if $quizConfig.mode === 'pronunciation'}
							<div class="card-question">
								<span class="big-character">{$currentCard.item.id}</span>
								<span class="card-definition">{cardData.definition || 'No definition'}</span>
							</div>
							<p class="card-hint">What is the pinyin?</p>
						{:else}
							<div class="card-question">
								<span class="card-pinyin">{cardData.pinyin || '—'}</span>
								<span class="card-definition">{cardData.definition || 'No definition'}</span>
							</div>
							<p class="card-hint">What character is this?</p>
						{/if}

						<!-- Answer Input Section -->
						{#if !$quizSession.isRevealed && !choiceSubmitted && !typingSubmitted}
							{#if $quizConfig.answerMode === 'self_rate'}
								<button class="btn btn-reveal" on:click={revealCard}>
									Show Answer
								</button>
								{:else if $quizConfig.answerMode === 'multiple_choice'}
								<div class="choice-options">
									{#each choiceOptions as option, i}
										<button
											class="choice-btn"
											class:selected={selectedChoice === i}
											class:correct={choiceSubmitted && option.isCorrect}
											class:incorrect={choiceSubmitted && selectedChoice === i && !option.isCorrect}
											on:click={() => selectChoiceOption(i)}
										>
											{option.text}
										</button>
									{/each}
								</div>
								<div class="choice-actions">
									{#if selectedChoice !== null}
										<button class="btn btn-primary btn-submit" on:click={submitChoice}>
											Submit Answer
										</button>
									{/if}
									<button class="btn btn-skip" on:click={skipChoice}>
										I don't know
									</button>
								</div>
								<p class="choice-hint">💡 Not sure? Click "I don't know" rather than guessing randomly.</p>
							{:else if $quizConfig.answerMode === 'typing'}
								<div class="typing-input">
									<input
										type="text"
										placeholder={$quizConfig.mode === 'recognition' ? 'Type meaning...' : $quizConfig.mode === 'pronunciation' ? 'Type pinyin (e.g., shui)...' : 'Type character...'}
										bind:value={typingAnswer}
										on:keypress={(e) => e.key === 'Enter' && ($quizConfig.mode !== 'pronunciation' || selectedTone !== null) && checkTypingAnswer()}
									/>
									
									{#if $quizConfig.mode === 'pronunciation'}
										<!-- Tone selection buttons -->
										<div class="tone-selector">
											<span class="tone-label">Tone:</span>
											<div class="tone-buttons">
												{#each [
													{ num: 1, marker: 'ˉ', name: '1st (flat)' },
													{ num: 2, marker: 'ˊ', name: '2nd (rising)' },
													{ num: 3, marker: 'ˇ', name: '3rd (dip)' },
													{ num: 4, marker: 'ˋ', name: '4th (falling)' },
													{ num: 5, marker: '·', name: '5th (neutral)' }
												] as tone}
													<button 
														class="tone-btn" 
														class:selected={selectedTone === tone.num}
														on:click={() => selectedTone = tone.num}
														title={tone.name}
													>
														<span class="tone-marker">{tone.marker}</span>
														<span class="tone-number">{tone.num}</span>
													</button>
												{/each}
											</div>
										</div>
									{/if}
									
									<button 
										class="btn btn-primary btn-submit" 
										on:click={checkTypingAnswer}
										disabled={!typingAnswer.trim() || ($quizConfig.mode === 'pronunciation' && selectedTone === null)}
									>
										Check
									</button>
									
									<button 
										class="btn btn-skip" 
										on:click={skipTyping}
									>
										I don't know
									</button>
								</div>
							{/if}
						{/if}

						<!-- Multiple choice result feedback -->
						{#if choiceSubmitted && !$quizSession.isRevealed}
							<div class="answer-feedback" class:correct={selectedChoice !== null && choiceOptions[selectedChoice]?.isCorrect} class:incorrect={selectedChoice !== null && !choiceOptions[selectedChoice]?.isCorrect} class:skipped={selectedChoice === null}>
								{#if selectedChoice === null}
									<span class="feedback-icon">⏭</span>
									<span>Skipped</span>
								{:else if choiceOptions[selectedChoice]?.isCorrect}
									<span class="feedback-icon">✓</span>
									<span>Correct!</span>
								{:else}
									<span class="feedback-icon">✗</span>
									<span>Incorrect</span>
								{/if}
							</div>
							
							<!-- Show the correct answer prominently -->
							<div class="answer-reveal">
								<div class="answer-label">Answer</div>
								<div class="answer-character">{choiceOptions.find(o => o.isCorrect)?.text}</div>
								{#if $quizConfig.mode === 'recall'}
									<div class="answer-details">
										<span class="answer-pinyin">{cardData?.pinyin}</span>
										<span class="answer-definition">{cardData?.definition}</span>
									</div>
								{/if}
							</div>
							
							<!-- Score breakdown -->
							{#if lastGradingResult}
								<div class="score-breakdown">
									<div class="score-item">
										<span class="score-label">Correctness</span>
										<span class="score-value" class:good={lastGradingResult.correctnessScore >= 0.6} class:bad={lastGradingResult.correctnessScore < 0.6}>
											{Math.round(lastGradingResult.correctnessScore * 100)}%
										</span>
									</div>
									<div class="score-item">
										<span class="score-label">Time</span>
										<span class="score-value" class:good={lastGradingResult.timeScore >= 0.7} class:medium={lastGradingResult.timeScore >= 0.4 && lastGradingResult.timeScore < 0.7} class:bad={lastGradingResult.timeScore < 0.4}>
											{(lastGradingResult.details.actualTimeMs / 1000).toFixed(1)}s
										</span>
									</div>
									<div class="score-item quality-score">
										<span class="score-label">Quality</span>
										<span class="score-badge quality-{lastGradingResult.sm2Quality}">
											{lastGradingResult.sm2Quality}/5
										</span>
									</div>
								</div>
							{/if}

							<!-- Continue button -->
							{#if pendingContinue}
								<button class="btn btn-continue" on:click={continueToNext}>
									Continue →
								</button>
							{/if}
						{/if}

						<!-- Typing result feedback -->
						{#if typingSubmitted && !$quizSession.isRevealed}
							<div class="answer-feedback" 
								class:correct={typingCorrect && ($quizConfig.mode !== 'pronunciation' || toneCorrect)} 
								class:partial={$quizConfig.mode === 'pronunciation' && typingCorrect && !toneCorrect}
								class:incorrect={!typingCorrect}
							>
								{#if $quizConfig.mode === 'pronunciation'}
									{#if typingCorrect && toneCorrect}
										<span class="feedback-icon">✓</span>
										<span>Correct!</span>
									{:else if typingCorrect && !toneCorrect}
										<span class="feedback-icon">~</span>
										<span>Pinyin correct, but wrong tone</span>
									{:else}
										<span class="feedback-icon">✗</span>
										<span>Incorrect</span>
									{/if}
								{:else if typingCorrect}
									<span class="feedback-icon">✓</span>
									<span>Correct!</span>
								{:else}
									<span class="feedback-icon">✗</span>
									<span>Incorrect</span>
								{/if}
							</div>
							
							<!-- Show the correct answer prominently for typing mode -->
							<div class="answer-reveal">
								<div class="answer-label">Answer</div>
								{#if $quizConfig.mode === 'recall'}
									<!-- Recall: show character + pinyin -->
									<div class="answer-character">{$currentCard.item.id}</div>
									<div class="answer-details">
										<span class="answer-pinyin">{cardData?.pinyin}</span>
									</div>
								{:else if $quizConfig.mode === 'recognition'}
									<!-- Recognition: show definition (that's what user typed) -->
									<div class="answer-character" style="font-size: 1.25rem;">{cardData?.definition}</div>
									<div class="answer-details">
										<span class="answer-pinyin">{cardData?.pinyin}</span>
									</div>
								{:else}
									<!-- Pronunciation: show pinyin (that's what user typed) -->
									<div class="answer-character">{cardData?.pinyin}</div>
								{/if}
							</div>

							<!-- Continue button -->
							{#if pendingContinue}
								<button class="btn btn-continue" on:click={continueToNext}>
									Continue →
								</button>
							{/if}
						{/if}
					</div>

					<!-- Back of card (Answer) -->
					{#if $quizSession.isRevealed}
						<div class="card-back">
							<div class="answer-section">
								<span class="answer-character">{$currentCard.item.id}</span>
								<span class="answer-pinyin">{cardData.pinyin || '—'}</span>
								<span class="answer-definition">{cardData.definition || 'No definition'}</span>
							</div>

							<div class="stage-badge" style="background: {getStageColor(getLearningStage($currentCard.item.repetitions || 0))}">
								{getLearningStage($currentCard.item.repetitions || 0)}
							</div>

							<div class="rating-buttons">
								<button class="rating-btn again" on:click={() => submitRating('again')}>
									<span class="rating-label">Again</span>
									<span class="rating-interval">1d</span>
								</button>
								<button class="rating-btn hard" on:click={() => submitRating('hard')}>
									<span class="rating-label">Hard</span>
									<span class="rating-interval">{formatInterval(Math.max(1, Math.round(($currentCard.item.interval || 1) * 0.8)))}</span>
								</button>
								<button class="rating-btn good" on:click={() => submitRating('good')}>
									<span class="rating-label">Good</span>
									<span class="rating-interval">{formatInterval(Math.round(($currentCard.item.interval || 1) * ($currentCard.item.easeFactor || 2.5)))}</span>
								</button>
								<button class="rating-btn easy" on:click={() => submitRating('easy')}>
									<span class="rating-label">Easy</span>
									<span class="rating-interval">{formatInterval(Math.round(($currentCard.item.interval || 1) * ($currentCard.item.easeFactor || 2.5) * 1.3))}</span>
								</button>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="loading">Loading card...</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.quiz-container {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem 1rem;
		min-height: 80vh;
	}

	.loading {
		text-align: center;
		padding: 4rem;
		color: #6b7280;
	}

	/* Setup Screen */
	.setup {
		text-align: center;
	}

	.setup h1 {
		font-size: 2rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
	}

	.source-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		background: #f3f4f6;
		padding: 0.25rem;
		border-radius: 0.75rem;
	}

	.source-tab {
		flex: 1;
		padding: 0.75rem 0.5rem;
		border: none;
		background: transparent;
		border-radius: 0.5rem;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.875rem;
		color: #6b7280;
		transition: all 0.2s ease;
	}

	.source-tab:hover {
		color: #374151;
	}

	.source-tab.active {
		background: white;
		color: #1f2937;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.source-selector {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.source-selector h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #374151;
	}

	.option-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.option-btn {
		padding: 0.75rem 0.5rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.option-btn:hover {
		border-color: #9ca3af;
	}

	.option-btn.active {
		border-color: #8b5cf6;
		background: #f5f3ff;
		color: #6d28d9;
	}

	.source-info {
		margin: 0;
		font-size: 0.875rem;
		color: #6b7280;
		text-align: center;
	}

	.stats-overview {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.empty-state {
		padding: 2rem;
		background: #fef3c7;
		border-radius: 0.75rem;
		margin-bottom: 2rem;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.hint {
		color: #92400e;
		font-size: 0.875rem;
	}

	.config-section {
		margin-bottom: 1.5rem;
		text-align: left;
	}

	.config-section h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: #374151;
	}

	.mode-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mode-btn {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.mode-btn:hover {
		border-color: #9ca3af;
	}

	.mode-btn.active {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.mode-label {
		font-weight: 600;
		color: #1f2937;
	}

	.mode-desc {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.size-options {
		display: flex;
		gap: 0.5rem;
	}

	.script-options {
		display: flex;
		gap: 0.5rem;
	}

	.script-btn {
		padding: 0.75rem 1rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		font-weight: 500;
		transition: all 0.2s ease;
		flex: 1;
	}

	.script-btn:hover {
		border-color: #9ca3af;
	}

	.script-btn.active {
		border-color: #4f46e5;
		background: #eef2ff;
		color: #4338ca;
	}

	.size-btn {
		padding: 0.75rem 1.5rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.size-btn:hover {
		border-color: #9ca3af;
	}

	.size-btn.active {
		border-color: #3b82f6;
		background: #eff6ff;
		color: #1d4ed8;
	}

	.toggle-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
	}

	.toggle-option input {
		width: 1.25rem;
		height: 1.25rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-primary {
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		color: white;
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #e5e7eb;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
	}

	.btn-start {
		width: 100%;
		padding: 1rem;
		font-size: 1.125rem;
		margin-top: 1rem;
	}

	/* Quiz Screen */
	.quiz-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		transition: width 0.3s ease;
	}

	.progress-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.progress-text {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.response-timer {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.3s ease;
	}

	.timer-icon {
		font-size: 1rem;
	}

	.timer-value {
		font-variant-numeric: tabular-nums;
		min-width: 2.5rem;
	}

	.timer-green {
		background: #dcfce7;
		color: #16a34a;
	}

	.timer-yellow {
		background: #fef3c7;
		color: #d97706;
	}

	.timer-orange {
		background: #ffedd5;
		color: #ea580c;
	}

	.timer-red {
		background: #fee2e2;
		color: #dc2626;
		animation: pulse 0.5s ease-in-out infinite alternate;
	}

	@keyframes pulse {
		from { transform: scale(1); }
		to { transform: scale(1.05); }
	}

	.card {
		width: 100%;
		background: white;
		border-radius: 1rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
		padding: 2rem;
		text-align: center;
	}

	.card-front {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.card-question {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.big-character {
		font-size: 6rem;
		font-weight: 400;
		color: #1f2937;
		line-height: 1;
	}

	.card-pinyin {
		font-size: 1.5rem;
		color: #3b82f6;
	}

	.card-definition {
		font-size: 1.25rem;
		color: #374151;
	}

	.card-hint {
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.btn-reveal {
		background: linear-gradient(135deg, #8b5cf6, #7c3aed);
		color: white;
		padding: 1rem 3rem;
		font-size: 1.125rem;
	}

	.btn-reveal:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
	}

	.btn-continue {
		background: linear-gradient(135deg, #22c55e, #16a34a);
		color: white;
		padding: 0.875rem 2.5rem;
		font-size: 1.125rem;
		margin-top: 1rem;
		border: none;
		border-radius: 0.75rem;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.btn-continue:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
	}

	.card-back {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.answer-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.answer-character {
		font-size: 4rem;
		color: #1f2937;
	}

	.answer-pinyin {
		font-size: 1.25rem;
		color: #3b82f6;
	}

	.answer-definition {
		font-size: 1rem;
		color: #6b7280;
	}

	.stage-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: white;
		text-transform: uppercase;
	}

	.rating-buttons {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		width: 100%;
	}

	.rating-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0.5rem;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.rating-btn:hover {
		transform: translateY(-2px);
	}

	.rating-btn.again {
		background: #fee2e2;
		color: #dc2626;
	}

	.rating-btn.hard {
		background: #fef3c7;
		color: #d97706;
	}

	.rating-btn.good {
		background: #dcfce7;
		color: #16a34a;
	}

	.rating-btn.easy {
		background: #dbeafe;
		color: #2563eb;
	}

	.rating-label {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.rating-interval {
		font-size: 0.75rem;
		opacity: 0.8;
	}

	/* Results Screen */
	.results {
		text-align: center;
	}

	.results h1 {
		font-size: 2rem;
		margin-bottom: 2rem;
	}

	.results-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.result-stat {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.result-stat.correct {
		background: #dcfce7;
		border-color: #86efac;
	}

	.result-stat.incorrect {
		background: #fee2e2;
		border-color: #fecaca;
	}

	.result-value {
		display: block;
		font-size: 2rem;
		font-weight: 700;
		color: #1f2937;
	}

	.result-label {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.accuracy-bar {
		height: 12px;
		background: #fee2e2;
		border-radius: 6px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.accuracy-fill {
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #16a34a);
		transition: width 0.5s ease;
	}

	.accuracy-label {
		font-size: 1.25rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 2rem;
	}

	.results-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	/* Multiple Choice Styles */
	.choice-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin: 1.5rem 0;
		width: 100%;
	}

	.choice-btn {
		padding: 1rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		font-size: 2rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: center;
		min-height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.choice-btn:hover {
		border-color: #4f46e5;
		background: #f5f3ff;
	}

	.choice-btn.selected {
		border-color: #4f46e5;
		background: #eef2ff;
		box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
	}

	.choice-btn.correct {
		border-color: #22c55e;
		background: #dcfce7;
	}

	.choice-btn.incorrect {
		border-color: #ef4444;
		background: #fee2e2;
	}

	.choice-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 1rem;
		flex-wrap: wrap;
	}

	.btn-skip {
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: 2px dashed #9ca3af;
		border-radius: 0.75rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-skip:hover {
		border-color: #6b7280;
		background: #f9fafb;
		color: #374151;
	}

	.choice-hint {
		margin-top: 1rem;
		font-size: 0.85rem;
		color: #9ca3af;
		text-align: center;
	}

	/* Typing Input Styles */
	.typing-input {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1.5rem 0;
		width: 100%;
	}

	.typing-input input {
		width: 100%;
		padding: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		font-size: 1.25rem;
		text-align: center;
		transition: border-color 0.2s ease;
	}

	.typing-input input:focus {
		outline: none;
		border-color: #4f46e5;
	}

	.btn-submit {
		padding: 0.875rem 2rem;
	}

	/* Tone Selector Styles */
	.tone-selector {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.tone-label {
		font-size: 0.9rem;
		color: #64748b;
		font-weight: 500;
	}

	.tone-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.tone-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 52px;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background: #fff;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tone-btn:hover {
		border-color: #a5b4fc;
		background: #f5f3ff;
	}

	.tone-btn.selected {
		border-color: #4f46e5;
		background: #eef2ff;
	}

	.tone-marker {
		font-size: 1.25rem;
		line-height: 1;
		color: #4f46e5;
	}

	.tone-number {
		font-size: 0.75rem;
		color: #64748b;
	}

	.tone-btn.selected .tone-number {
		color: #4f46e5;
		font-weight: 600;
	}

	/* Answer Feedback Styles */
	.answer-feedback {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: 0.75rem;
		margin-top: 1rem;
		font-size: 1.1rem;
		font-weight: 500;
		justify-content: center;
	}

	.answer-feedback.correct {
		background: #dcfce7;
		color: #166534;
	}

	.answer-feedback.incorrect {
		background: #fee2e2;
		color: #991b1b;
	}

	.feedback-icon {
		font-size: 1.5rem;
		font-weight: bold;
	}

	.answer-feedback.skipped {
		background: #fef3c7;
		color: #92400e;
	}

	.answer-feedback.partial {
		background: #fff7ed;
		color: #c2410c;
	}

	.answer-reveal {
		text-align: center;
		margin-top: 1rem;
		padding: 1rem;
		background: #f0f9ff;
		border-radius: 0.75rem;
		border: 1px solid #bae6fd;
	}

	.answer-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #64748b;
		margin-bottom: 0.25rem;
	}

	.answer-character {
		font-size: 2.5rem;
		font-weight: 600;
		color: #0369a1;
	}

	.answer-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.5rem;
	}

	.answer-pinyin {
		font-size: 1rem;
		color: #4f46e5;
	}

	.answer-definition {
		font-size: 0.9rem;
		color: #64748b;
	}

	.score-breakdown {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: #f8fafc;
		border-radius: 0.5rem;
		font-size: 0.85rem;
	}

	.score-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.score-label {
		color: #64748b;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.score-value {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.score-value.good { color: #16a34a; }
	.score-value.medium { color: #d97706; }
	.score-value.bad { color: #dc2626; }

	.score-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		font-weight: 700;
		font-size: 0.9rem;
	}

	.quality-0, .quality-1, .quality-2 { background: #fee2e2; color: #dc2626; }
	.quality-3 { background: #fef3c7; color: #d97706; }
	.quality-4 { background: #dcfce7; color: #16a34a; }
	.quality-5 { background: #d1fae5; color: #059669; }

	@media (max-width: 640px) {
		.stats-overview {
			flex-direction: column;
		}

		.size-options {
			flex-wrap: wrap;
		}

		.rating-buttons {
			grid-template-columns: repeat(2, 1fr);
		}

		.big-character {
			font-size: 4rem;
		}

		.review-item {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.review-details {
			width: 100%;
			order: 10;
		}
	}

	/* Results Review Section */
	.results-review {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.results-review h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 1rem;
		text-align: left;
	}

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.review-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
	}

	.review-item.correct {
		border-left-color: #22c55e;
		background: #f0fdf4;
	}

	.review-item.incorrect {
		border-left-color: #ef4444;
		background: #fef2f2;
	}

	.review-status {
		flex-shrink: 0;
	}

	.status-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		font-weight: bold;
		font-size: 0.875rem;
	}

	.status-icon.correct {
		background: #22c55e;
		color: white;
	}

	.status-icon.incorrect {
		background: #ef4444;
		color: white;
	}

	.review-character {
		font-size: 1.5rem;
		font-weight: 600;
		min-width: 2.5rem;
		text-align: center;
		flex-shrink: 0;
		color: #1f2937;
	}

	.review-details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.review-pinyin {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.review-definition {
		font-size: 0.75rem;
		color: #9ca3af;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.review-rating {
		flex-shrink: 0;
	}

	.review-rating .rating-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.review-rating .rating-badge.again {
		background: #fee2e2;
		color: #dc2626;
	}

	.review-rating .rating-badge.hard {
		background: #fef3c7;
		color: #d97706;
	}

	.review-rating .rating-badge.good {
		background: #dcfce7;
		color: #16a34a;
	}

	.review-rating .rating-badge.easy {
		background: #d1fae5;
		color: #059669;
	}

	.review-actions {
		flex-shrink: 0;
	}

	.add-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid #8b5cf6;
		background: white;
		color: #8b5cf6;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-btn:hover:not(:disabled) {
		background: #8b5cf6;
		color: white;
	}

	.add-btn.added {
		background: #f3f4f6;
		border-color: #d1d5db;
		color: #9ca3af;
		cursor: default;
	}
</style>
