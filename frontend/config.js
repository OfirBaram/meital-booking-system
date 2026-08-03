const APP_CONFIG = {
    API_URL:           "https://script.google.com/macros/s/AKfycbw32cmN1CPb6q91eSOyU3GaP-lm9FAHMrYSc9goyOKFpxeROJMl6oFg2Q_WpxMiFzsfUw/exec",
    SUPABASE_URL:      "https://callmnxlcganwugxwiym.supabase.co",
    // Publishable key — public by design, safe to ship in the browser.
    //
    // Do NOT put the legacy `eyJ...` anon JWT back here. The comment that used
    // to sit in this spot said the opposite ("must start with eyJ"; "the
    // sb_publishable_... key will cause 401 errors") and it is what kept a dead
    // key in place. Verified against this project on 2026-08-03:
    //   legacy eyJ... → PostgREST: {"message":"Invalid API key"}
    //                 → verify_jwt=true function: UNAUTHORIZED_INVALID_JWT_FORMAT
    //                   (rejected at the platform gate, never reaches the code)
    //   sb_publishable_... → PostgREST: 200
    //                      → verify_jwt=true function: reaches the handler
    // The dead key broke my-booking.html — the cancel/reschedule page customers
    // open from an SMS link — because client-portal/cancel/reschedule all run
    // with verify_jwt = true.
    //
    // Unrelated to SUPABASE_ANON_KEY inside Edge Functions: that env var is
    // injected by the platform, is valid, and is what chat-handler uses.
    SUPABASE_ANON_KEY: "sb_publishable_jdsiuEIyFXDUS6kxkyOYDA_juWKqjAZ",
    VERSION: "2.0.0",
    IS_MOCK_MODE: false,
    IS_MAINTENANCE_MODE: false
};

export default APP_CONFIG;
