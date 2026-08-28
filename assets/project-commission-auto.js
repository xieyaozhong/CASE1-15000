(() => {
  'use strict';

  let raf = 0;
  let microtaskQueued = false;

  const numberValue = input => {
    const value = Number(String(input?.value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  };

  const formatPercent = value => {
    const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
    return String(rounded);
  };

  function findFields() {
    const modal = document.querySelector('.project-modal');
    if (!modal) return null;

    const labels = [...modal.querySelectorAll('.financial-fields label')];
    const labelText = label => String(label.textContent || '').replace(/\s+/g, ' ').trim();

    const totalLabel = labels.find(label => {
      const text = labelText(label);
      return text.startsWith('仲介費') && !text.startsWith('公司仲介費') && !text.startsWith('個人仲介費');
    });
    const companyLabel = labels.find(label => labelText(label).startsWith('公司仲介費'));
    const personalLabel = labels.find(label => labelText(label).startsWith('個人仲介費'));

    const total = totalLabel?.querySelector('input');
    const company = companyLabel?.querySelector('input');
    const personal = personalLabel?.querySelector('input');

    if (!total || !company || !personal) return null;
    return { modal, totalLabel, total, company, personal };
  }

  function setReactInputValue(input, value) {
    if (!input || input.value === value) return;

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncCommission() {
    raf = 0;
    microtaskQueued = false;

    const fields = findFields();
    if (!fields) return;

    const { totalLabel, total, company, personal } = fields;
    const sum = numberValue(company) + numberValue(personal);
    const nextValue = formatPercent(sum);

    total.readOnly = true;
    total.setAttribute('aria-readonly', 'true');
    total.title = '自動計算：公司仲介費 + 個人仲介費';
    total.classList.add('auto-commission-total');
    totalLabel?.classList.add('auto-commission-label');

    setReactInputValue(total, nextValue);
  }

  function scheduleSync() {
    if (!microtaskQueued) {
      microtaskQueued = true;
      queueMicrotask(() => {
        microtaskQueued = false;
        syncCommission();
      });
    }

    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(syncCommission);
    });
  }

  function belongsToSplitField(target) {
    const label = target?.closest?.('.project-modal .financial-fields label');
    if (!label) return false;
    const text = String(label.textContent || '').replace(/\s+/g, ' ').trim();
    return text.startsWith('公司仲介費') || text.startsWith('個人仲介費');
  }

  function injectStyle() {
    if (document.getElementById('project-commission-auto-style')) return;

    const style = document.createElement('style');
    style.id = 'project-commission-auto-style';
    style.textContent = `
      .project-modal .auto-commission-label{position:relative;}
      .project-modal .auto-commission-label::after{
        content:'AUTO';
        display:inline-flex;
        align-items:center;
        justify-content:center;
        margin-left:6px;
        padding:2px 6px;
        border-radius:999px;
        background:#eaf5ee;
        color:#217346;
        font-size:9px;
        font-weight:800;
        letter-spacing:.04em;
        vertical-align:middle;
      }
      .project-modal .auto-commission-total{
        background:#f4f8f5!important;
        color:#1f5138!important;
        font-weight:700!important;
        cursor:default!important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('input', event => {
    if (belongsToSplitField(event.target)) scheduleSync();
  }, true);

  document.addEventListener('change', event => {
    if (belongsToSplitField(event.target)) scheduleSync();
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target?.closest?.('.project-modal')) scheduleSync();
  }, true);

  document.addEventListener('pointerdown', event => {
    if (event.target?.closest?.('.project-modal button[type="submit"]')) syncCommission();
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.matches?.('.project-modal')) syncCommission();
  }, true);

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.includes('新增投資案')) scheduleSync();
  }, true);

  injectStyle();
  scheduleSync();
})();