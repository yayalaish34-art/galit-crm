/* הגדרות משותפות לתוסף My CRM. אין לשמור כאן secrets/סיסמאות/טוקנים ארוכי-טווח. */
window.MYCRM = window.MYCRM || {};
window.MYCRM.CONFIG = {
  CRM_PUBLIC_URL: 'https://crm.galit.co.il',
  CRM_API_URL: 'https://galit.up.railway.app',
  // מפתח לשמירת ה-JWT הקצר-טווח של ה-CRM ב-localStorage של התוסף.
  TOKEN_KEY: 'mycrm-addin-token',
};
