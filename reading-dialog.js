let dialog;
let title;
let body;
let backButton;

export function closeOnBackdrop(dialog) {
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}

export function openReading(titleText, content, { onBack } = {}) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'reading-dialog';
    dialog.setAttribute('aria-labelledby', 'readingTitle');
    const head = document.createElement('div');
    head.className = 'dialog-head';
    title = document.createElement('h2');
    title.id = 'readingTitle';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Fechar';
    close.autofocus = true;
    close.addEventListener('click', () => dialog.close());
    backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = '← Voltar';
    backButton.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'dialog-head-actions';
    actions.append(backButton, close);
    head.append(title, actions);
    body = document.createElement('div');
    body.className = 'dialog-body';
    body.tabIndex = 0;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', 'readingTitle');
    dialog.append(head, body);
    closeOnBackdrop(dialog);
    document.body.append(dialog);
  }
  title.textContent = titleText;
  backButton.hidden = !onBack;
  backButton.onclick = onBack || null;
  body.replaceChildren(...(Array.isArray(content) ? content : [content]));
  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
}

export function readingBackTo(trigger) {
  if (!dialog?.open) return undefined;
  const previousTitle = title.textContent;
  const previousContent = Array.from(body.childNodes);
  const previousBack = backButton.onclick;
  const scrollTop = body.scrollTop;
  return () => {
    openReading(previousTitle, previousContent, { onBack: previousBack });
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    body.scrollTop = scrollTop;
  };
}
