/**
 * פונקציה חד-פעמית להקמת כל הגיליונות והעמודות בצורה מושלמת
 */
function initialSetup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // הגדרת הגיליונות והכותרות שלהם
  const sheetsToCreate = [
    { name: 'Weekly_Slots', headers: ['Date', 'Time', 'Status', 'Notes'] },
    { name: 'Bookings_Log', headers: ['UUID', 'Timestamp', 'Name', 'Phone', 'Service', 'Service_Name', 'Date', 'Time', 'Duration', 'Status', 'Cal_Event_ID'] },
    { name: 'Audit_Log', headers: ['Timestamp', 'Admin', 'Action', 'BookingId', 'PrevStatus', 'NewStatus', 'Detail'] },
    { name: 'SMS_LOG', headers: ['Timestamp', 'Phone', 'Action', 'Status', 'Message_Content'] }
  ];

  sheetsToCreate.forEach(config => {
    let sheet = spreadsheet.getSheetByName(config.name);
    
    // אם הגיליון לא קיים - צור אותו
    if (!sheet) {
      sheet = spreadsheet.insertSheet(config.name);
    } else {
      sheet.clear(); // אם הוא קיים - נקה אותו כדי להתחיל נקי
    }
    
    // הזרקת הכותרות לשורה הראשונה
    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
    
    // עיצוב קטן (מודגש וצבע רקע) כדי שיהיה נוח בעין
    sheet.getRange(1, 1, 1, config.headers.length)
         .setFontWeight('bold')
         .setBackground('#f3f3f3');
    
    sheet.setFrozenRows(1); // הקפאת שורת הכותרת
  });

  // הוספת שורת בדיקה ל-Bookings_Log כדי שהדשבורד לא יהיה ריק
  const logSheet = spreadsheet.getSheetByName('Bookings_Log');
  logSheet.appendRow([
    'test-uuid-123', 
    new Date(), 
    'לקוחה בדיקה', 
    '0501234567', 
    'gel', 
    'לק ג\'ל', 
    '2026-05-20', 
    '10:00', 
    '90', 
    'Pending', 
    ''
  ]);

  Logger.log('🎉 Setup complete! All sheets and headers created.');
}