(function () {
  var popupId = 16671;
  var modalSelector = '#elementor-popup-modal-' + popupId;
  var activeClass = 'galit-cookie-popup-open';
  var savedClass = 'galit-cookie-choice-saved';
  var timer;

  function hasSavedChoice() {
    var cookie = document.cookie.split(';').find(function (item) {
      return item.trim().indexOf('cookieyes-consent=') === 0;
    });
    if (!cookie) return false;
    var value = cookie.trim().slice('cookieyes-consent='.length);
    try { value = decodeURIComponent(value); } catch (error) {}
    // CookieYes creates this cookie before a visitor chooses. Only action
    // confirms a choice; consent:no also exists before any interaction.
    return /(?:^|,)action:[^,]+(?:,|$)/.test(value);
  }

  function releaseBanner() {
    document.documentElement.classList.remove(activeClass);
    window.clearInterval(timer);
  }

  function closePopup() {
    document.documentElement.classList.add(savedClass);
    releaseBanner();
    var doc = window.elementorFrontend && window.elementorFrontend.documentsManager &&
      window.elementorFrontend.documentsManager.documents[popupId];
    if (doc) doc.getModal().hide();
  }

  function syncChoice() {
    if (hasSavedChoice()) closePopup();
  }

  function onShow() {
    if (hasSavedChoice()) {
      // Elementor finishes opening after emitting its show event.
      // Hide after that call completes so it cannot reopen the modal.
      window.setTimeout(closePopup, 0);
      return;
    }
    document.documentElement.classList.remove(savedClass);
    document.documentElement.classList.add(activeClass);
    window.clearInterval(timer);
    timer = window.setInterval(syncChoice, 300);
  }

  var style = document.createElement('style');
  style.textContent = '.' + activeClass + ' .cky-consent-container{display:none!important}' +
    '.' + savedClass + ' ' + modalSelector + '{display:none!important}';
  document.head.appendChild(style);
  if (hasSavedChoice()) document.documentElement.classList.add(savedClass);

  window.jQuery(document).on('elementor/popup/show.galitCookie', function (event, id) {
    if (Number(id) === popupId) onShow();
  }).on('elementor/popup/hide.galitCookie', function (event, id) {
    if (Number(id) === popupId) releaseBanner();
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.galit-cookie-actions button');
    if (!button || !button.closest(modalSelector)) return;
    var selectors = {
      'galit-cookie-accept': '.cky-btn-accept',
      'galit-cookie-reject': '.cky-btn-reject',
      'galit-cookie-settings': '.cky-btn-customize'
    };
    var selector = selectors[button.id];
    if (!selector) return;
    event.preventDefault();
    var nativeButton = document.querySelector('.cky-consent-container ' + selector);
    if (nativeButton) {
      nativeButton.click();
      syncChoice();
    } else {
      releaseBanner();
      var status = document.getElementById('galit-cookie-status');
      if (status) status.textContent = 'אפשר לבחור את ההעדפות בחלונית העוגיות.';
    }
  });
})();
