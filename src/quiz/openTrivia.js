// Open Trivia DB — free, keyless public trivia API. Category 18 = "Science: Computers"
// (closest fit to "tech"); omitting category gives true general-knowledge questions.
const CATEGORIES = {
  tech: 18,
  general: null // no category param = any category
};

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&uuml;/g, 'ü')
    .replace(/&ouml;/g, 'ö');
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Fetch one multiple-choice question from Open Trivia DB.
 * type: 'tech' | 'general'
 */
export async function fetchTriviaQuestion(type = 'general') {
  const categoryId = CATEGORIES[type];
  const url = `https://opentdb.com/api.php?amount=1&type=multiple${categoryId ? `&category=${categoryId}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Trivia DB request failed: ${res.status}`);
  const data = await res.json();
  if (data.response_code !== 0 || !data.results?.length) {
    throw new Error('No trivia question available right now.');
  }

  const result = data.results[0];
  const question = decodeEntities(result.question);
  const correctAnswer = decodeEntities(result.correct_answer);
  const incorrectAnswers = result.incorrect_answers.map(decodeEntities);
  const options = shuffle([correctAnswer, ...incorrectAnswers]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    key: `trivia-${Buffer.from(question).toString('base64').slice(0, 24)}`,
    category: decodeEntities(result.category),
    question,
    options,
    correctIndex
  };
}
