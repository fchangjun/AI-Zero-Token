const imageUrl = new URL('./author-contact.png', import.meta.url).href;
let dialog;
let opener;

function contactDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'author-contact-dialog';
  dialog.setAttribute('aria-labelledby', 'author-contact-title');
  dialog.setAttribute('aria-describedby', 'author-contact-description');
  dialog.innerHTML = `<div class="author-contact-heading"><h2 id="author-contact-title">联系作者</h2><form method="dialog"><button type="submit" aria-label="关闭联系作者" autofocus>×</button></form></div><p id="author-contact-description">如需订阅重置提醒，请联系作者。</p><img class="author-contact-code" alt="作者的微信联系二维码" width="1110" height="1491"><p class="author-contact-hint">使用微信扫一扫，或保存图片后识别二维码。</p>`;
  dialog.querySelector('img').src = imageUrl;
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('author-contact-open');
    if (opener?.isConnected) opener.focus();
  });
  document.body.append(dialog);
  return dialog;
}

document.querySelectorAll('[data-author-contact]').forEach(link => {
  link.addEventListener('click', event => {
    // The image link remains usable in browsers without native dialog support.
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
    event.preventDefault();
    opener = link;
    const contact = contactDialog();
    if (contact.open) return;
    contact.showModal();
    document.body.classList.add('author-contact-open');
  });
});
