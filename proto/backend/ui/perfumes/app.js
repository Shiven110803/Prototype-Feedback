// Embedded copy of fragrance recommender JS
// Simple data-driven fragrance recommender (VS & BBW)
// No external libs; contains a lightweight confetti implementation

(function() {
  // Product catalogs: curated examples with tags and official links
  // WOMEN
  const womenProducts = [];
  const menProducts = [];
  // For brevity in this embed, defer to remote script if available
  // If you want full offline data parity, copy over the product arrays from source.

  const womenQuestions = [];
  const menQuestions = [];

  let segment = 'women';
  let activeProducts = womenProducts;
  let activeQuestions = womenQuestions;

  let current = 0; let answers = [];
  const qEl = document.getElementById('question-text');
  const quizEl = document.getElementById('quiz');
  const resEl = document.getElementById('result');
  const yesBtn = document.getElementById('btn-yes');
  const noBtn = document.getElementById('btn-no');
  const anyBtn = document.getElementById('btn-any');
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  const recName = document.getElementById('rec-name');
  const recDesc = document.getElementById('rec-desc');
  const recFamily = document.getElementById('rec-family');
  const recBase = document.getElementById('rec-basenotes');
  const buyLink = document.getElementById('buy-link');
  const brandPill = document.getElementById('brand-pill');
  const scoreLine = document.getElementById('score-line');
  const restartBtn = document.getElementById('btn-restart');
  const recImg = document.getElementById('rec-image');
  const segWomenBtn = document.getElementById('seg-women');
  const segMenBtn = document.getElementById('seg-men');
  const heroSub = document.getElementById('hero-sub');
  const viewGalleryBtn = document.getElementById('view-gallery');
  const exhibitionsBtn = document.getElementById('btn-exhibitions');
  const changePicBtn = document.getElementById('btn-change-picture');
  const resetPicBtn = document.getElementById('btn-reset-picture');
  const imgStatus = document.getElementById('img-status');

  function renderQuestion() {
    const q = activeQuestions[current];
    if (!q) { qEl.textContent = 'Add products/questions to enable quiz.'; return; }
    qEl.textContent = q.text;
    progressText.textContent = `Question ${current + 1} of ${activeQuestions.length}`;
    const pct = ((current) / activeQuestions.length) * 100;
    progressBar.style.width = Math.max(10, Math.min(100, pct + 10)) + '%';
  }

  function next(answerVal) {
    answers.push(answerVal);
    current++;
    if (current < activeQuestions.length) {
      renderQuestion();
    } else {
      showResult();
    }
  }

  function showResult() {
    quizEl.classList.add('hidden');
    resEl.classList.remove('hidden');
    recName.textContent = 'Your Fragrance';
    recDesc.textContent = 'Thanks for trying the embedded demo.';
    recFamily.textContent = 'vanilla, floral';
    recBase.textContent = 'amber, musk';
    buyLink.href = '#';
    brandPill.textContent = 'Charminar';
    scoreLine.textContent = 'Demo';
    recImg.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect x="40" y="20" width="160" height="40" rx="8" fill="#d4b782"/><rect x="20" y="60" width="200" height="260" rx="24" fill="#ffd6e7" stroke="#e8e8e8"/></svg>');
  }

  if (yesBtn) yesBtn.addEventListener('click', () => next(true));
  if (noBtn) noBtn.addEventListener('click', () => next(false));
  if (anyBtn) anyBtn.addEventListener('click', () => next(null));
  if (restartBtn) restartBtn.addEventListener('click', () => { current = 0; answers = []; resEl.classList.add('hidden'); quizEl.classList.remove('hidden'); renderQuestion(); });
  if (segWomenBtn && segMenBtn) {
    segWomenBtn.addEventListener('click', () => { segment='women'; activeProducts=womenProducts; activeQuestions=womenQuestions; heroSub.textContent='Answer 10 quick questions and we’ll suggest a fine fragrance mist that matches your vibe.'; current=0; answers=[]; resEl.classList.add('hidden'); quizEl.classList.remove('hidden'); renderQuestion(); });
    segMenBtn.addEventListener('click', () => { segment='men'; activeProducts=menProducts; activeQuestions=menQuestions; heroSub.textContent='Answer 10 quick questions and we’ll suggest a men’s body spray with the vibe you want.'; current=0; answers=[]; resEl.classList.add('hidden'); quizEl.classList.remove('hidden'); renderQuestion(); });
  }

  renderQuestion();
})();
