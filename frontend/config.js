const APP_CONFIG = {
    API_URL:           "https://script.google.com/macros/s/AKfycbw32cmN1CPb6q91eSOyU3GaP-lm9FAHMrYSc9goyOKFpxeROJMl6oFg2Q_WpxMiFzsfUw/exec",
    SUPABASE_URL:      "https://callmnxlcganwugxwiym.supabase.co",
    // Use the JWT anon key from: Supabase Dashboard → Project Settings → API
    // → "Project API Keys" → "anon public". It must start with "eyJ".
    // The "sb_publishable_..." key is NOT a JWT and will cause 401 errors.
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbGxtbnhsY2dhbnd1Z3h3aXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjMwMDAsImV4cCI6MjA5NDY5OTAwMH0.79kCMds3YptSKwxnUKO09GoybggSwWG1aaYlUxJlsQ8",
    VERSION: "2.0.0",
    IS_MOCK_MODE: false
};

export default APP_CONFIG;
