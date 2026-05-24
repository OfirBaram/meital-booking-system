const APP_CONFIG = {
    SUPABASE_URL:      "https://callmnxlcganwugxwiym.supabase.co",
    // Use the JWT anon key from: Supabase Dashboard → Project Settings → API
    // → "Project API Keys" → "anon public". It must start with "eyJ".
    // The "sb_publishable_..." key is NOT a JWT and will cause 401 errors.
    SUPABASE_ANON_KEY: "eyJ...",
    VERSION: "2.0.0",
    IS_MOCK_MODE: false
};

export default APP_CONFIG;