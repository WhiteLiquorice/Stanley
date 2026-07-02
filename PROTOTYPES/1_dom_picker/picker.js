class DOMPicker {
  constructor() {
    this.isActive = false;
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
    this.overlay.style.border = '2px solid #3b82f6';
    this.overlay.style.zIndex = '9999';
    this.overlay.style.transition = 'all 0.1s ease';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  start() {
    this.isActive = true;
    this.overlay.style.display = 'block';
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKeyDown);
    document.getElementById('picker-mode-banner').style.display = 'block';
  }

  stop() {
    this.isActive = false;
    this.overlay.style.display = 'none';
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKeyDown);
    document.getElementById('picker-mode-banner').style.display = 'none';
  }

  onMouseMove(e) {
    if (!this.isActive) return;
    const target = e.target;
    // Ignore UI overlay
    if (target.id === 'picker-mode-banner' || target.closest('#result-panel')) return;
    
    const rect = target.getBoundingClientRect();
    this.overlay.style.top = rect.top + 'px';
    this.overlay.style.left = rect.left + 'px';
    this.overlay.style.width = rect.width + 'px';
    this.overlay.style.height = rect.height + 'px';
  }

  onClick(e) {
    if (!this.isActive) return;
    
    const target = e.target;
    if (target.id === 'start-picker' || target.id === 'picker-mode-banner' || target.closest('#result-panel')) return;
    
    e.preventDefault();
    e.stopPropagation();

    const selector = this.generateSelector(target);
    this.showResult(selector);
    this.stop();
  }

  onKeyDown(e) {
    if (e.key === 'Escape') this.stop();
  }

  generateSelector(el) {
    if (el.id) return `#${el.id}`;
    
    let path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.nodeName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break; // Unique enough
      } else {
        let sibling = current, nth = 1;
        while (sibling = sibling.previousElementSibling) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      
      // Try to add classes for readability if no pseudo-class used
      if (!selector.includes(':') && current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter(c => c && !c.includes('hover') && !c.includes('active'));
        if (classes.length > 0) selector += `.${classes.join('.')}`;
      }
      
      path.unshift(selector);
      current = current.parentNode;
    }
    return path.join(' > ');
  }

  showResult(selector) {
    const panel = document.getElementById('result-panel');
    const code = document.getElementById('result-code');
    code.textContent = selector;
    panel.style.display = 'block';
  }
}

const picker = new DOMPicker();
document.getElementById('start-picker').addEventListener('click', () => {
  picker.start();
  document.getElementById('result-panel').style.display = 'none';
});
