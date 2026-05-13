/**
 * Branding Styles Data for Dashboard UI
 *
 * This is the dashboard-local representation of the 50 branding styles
 * from the ZionX Studio branding library. Used by the studio view to render
 * the branding selector grid.
 */

export interface BrandingStyleCard {
  id: string;
  name: string;
  category: string;
  description: string;
  inspiration: string;
  gradient: string;
  mode: 'light' | 'dark' | 'auto';
}

export const BRANDING_CATEGORIES = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'wellness', label: 'Wellness', icon: '🧘' },
  { id: 'productivity', label: 'Productivity', icon: '⚡' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'social', label: 'Social', icon: '💬' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'health', label: 'Health & Fitness', icon: '🏋️' },
  { id: 'lifestyle', label: 'Lifestyle', icon: '✨' },
  { id: 'business', label: 'Business', icon: '💼' },
  { id: 'creative', label: 'Creative', icon: '🎨' },
];

export const BRANDING_STYLES: BrandingStyleCard[] = [
  // Wellness (6)
  { id: 'calm-serenity', name: 'Calm Serenity', category: 'wellness', description: 'Deep navy + gold accents, serif headings, spacious', inspiration: 'Calm app', gradient: 'linear-gradient(135deg, #0F1B33 0%, #2C3E6B 50%, #D4AF37 100%)', mode: 'dark' },
  { id: 'headspace-playful', name: 'Headspace Playful', category: 'wellness', description: 'Warm orange + illustrated style, rounded, playful', inspiration: 'Headspace', gradient: 'linear-gradient(135deg, #FFF8F0 0%, #F47D31 50%, #FDB813 100%)', mode: 'light' },
  { id: 'zen-garden', name: 'Zen Garden', category: 'wellness', description: 'Muted greens + cream, Japanese minimalism', inspiration: 'Japanese zen aesthetics', gradient: 'linear-gradient(135deg, #F7F4F0 0%, #8B9E7C 50%, #5B7A5E 100%)', mode: 'light' },
  { id: 'ocean-breath', name: 'Ocean Breath', category: 'wellness', description: 'Teal gradients + white, flowing organic shapes', inspiration: 'Ocean meditation apps', gradient: 'linear-gradient(135deg, #F0FDFA 0%, #0D9488 50%, #06B6D4 100%)', mode: 'light' },
  { id: 'sunset-meditation', name: 'Sunset Meditation', category: 'wellness', description: 'Warm peach/coral gradients, soft rounded corners', inspiration: 'Sunset/golden hour aesthetics', gradient: 'linear-gradient(135deg, #FFF7ED 0%, #F97066 50%, #FDBA74 100%)', mode: 'light' },
  { id: 'forest-therapy', name: 'Forest Therapy', category: 'wellness', description: 'Deep greens + earth tones, natural textures', inspiration: 'Forest bathing / Shinrin-yoku', gradient: 'linear-gradient(135deg, #F5F2EB 0%, #166534 50%, #4D7C0F 100%)', mode: 'light' },

  // Productivity (7)
  { id: 'notion-clean', name: 'Notion Clean', category: 'productivity', description: 'Black + white, minimal, system fonts, no shadows', inspiration: 'Notion', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F7F6F3 50%, #37352F 100%)', mode: 'light' },
  { id: 'linear-precision', name: 'Linear Precision', category: 'productivity', description: 'Purple accent on dark, sharp corners, compact', inspiration: 'Linear', gradient: 'linear-gradient(135deg, #0A0A0F 0%, #16161F 50%, #5E6AD2 100%)', mode: 'dark' },
  { id: 'todoist-focus', name: 'Todoist Focus', category: 'productivity', description: 'Red accent, clean white, subtle shadows', inspiration: 'Todoist', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 50%, #DB4035 100%)', mode: 'light' },
  { id: 'things-elegant', name: 'Things Elegant', category: 'productivity', description: 'Blue headers, white cards, refined typography', inspiration: 'Things 3', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F7FA 50%, #4A90D9 100%)', mode: 'light' },
  { id: 'obsidian-dark', name: 'Obsidian Dark', category: 'productivity', description: 'Pure dark mode, purple accents, monospace', inspiration: 'Obsidian', gradient: 'linear-gradient(135deg, #1E1E1E 0%, #262626 50%, #A855F7 100%)', mode: 'dark' },
  { id: 'craft-premium', name: 'Craft Premium', category: 'productivity', description: 'Warm grays, elegant serif headings, spacious', inspiration: 'Craft', gradient: 'linear-gradient(135deg, #FFFDF8 0%, #F5F3EE 50%, #0066FF 100%)', mode: 'light' },
  { id: 'arc-browser', name: 'Arc Browser', category: 'productivity', description: 'Vibrant gradients, playful, rounded, bold colors', inspiration: 'Arc Browser', gradient: 'linear-gradient(135deg, #6366F1 0%, #EC4899 50%, #F59E0B 100%)', mode: 'light' },

  // Finance (6)
  { id: 'robinhood-bold', name: 'Robinhood Bold', category: 'finance', description: 'Bright green on black, bold numbers, compact', inspiration: 'Robinhood', gradient: 'linear-gradient(135deg, #000000 0%, #1E1E1E 50%, #00C805 100%)', mode: 'dark' },
  { id: 'revolut-modern', name: 'Revolut Modern', category: 'finance', description: 'Dark purple/blue, clean cards, subtle gradients', inspiration: 'Revolut', gradient: 'linear-gradient(135deg, #0A0E17 0%, #141B2D 50%, #6C47FF 100%)', mode: 'dark' },
  { id: 'wise-clean', name: 'Wise Clean', category: 'finance', description: 'Bright green + white, friendly, rounded', inspiration: 'Wise (TransferWise)', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F2F5F9 50%, #9FE870 100%)', mode: 'light' },
  { id: 'mercury-minimal', name: 'Mercury Minimal', category: 'finance', description: 'Monochrome, ultra-minimal, elegant', inspiration: 'Mercury bank', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F9F9F9 50%, #1C1C1C 100%)', mode: 'light' },
  { id: 'coinbase-pro', name: 'Coinbase Pro', category: 'finance', description: 'Blue accent, dark mode, data-dense', inspiration: 'Coinbase', gradient: 'linear-gradient(135deg, #0A0B0D 0%, #1E2025 50%, #0052FF 100%)', mode: 'dark' },
  { id: 'cash-app', name: 'Cash App', category: 'finance', description: 'Bold green, playful, large typography', inspiration: 'Cash App', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 50%, #00D632 100%)', mode: 'light' },

  // Social (5)
  { id: 'instagram-warm', name: 'Instagram Warm', category: 'social', description: 'Warm gradients (pink/orange/purple), white cards', inspiration: 'Instagram', gradient: 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)', mode: 'light' },
  { id: 'discord-gamer', name: 'Discord Gamer', category: 'social', description: 'Blurple + dark gray, rounded, playful, compact', inspiration: 'Discord', gradient: 'linear-gradient(135deg, #313338 0%, #2B2D31 50%, #5865F2 100%)', mode: 'dark' },
  { id: 'threads-clean', name: 'Threads Clean', category: 'social', description: 'Black + white, minimal, system font', inspiration: 'Threads', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 50%, #000000 100%)', mode: 'light' },
  { id: 'bereal-authentic', name: 'BeReal Authentic', category: 'social', description: 'Yellow accent, raw/unpolished feel, bold', inspiration: 'BeReal', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #FFFF00 50%, #000000 100%)', mode: 'light' },
  { id: 'lemon8-fresh', name: 'Lemon8 Fresh', category: 'social', description: 'Pastel colors, soft gradients, lifestyle aesthetic', inspiration: 'Lemon8', gradient: 'linear-gradient(135deg, #FFFEF5 0%, #A8E6CF 50%, #FFB7B2 100%)', mode: 'light' },

  // Entertainment (5)
  { id: 'spotify-dark', name: 'Spotify Dark', category: 'entertainment', description: 'Green on black, bold typography, card-based', inspiration: 'Spotify', gradient: 'linear-gradient(135deg, #121212 0%, #181818 50%, #1DB954 100%)', mode: 'dark' },
  { id: 'netflix-cinematic', name: 'Netflix Cinematic', category: 'entertainment', description: 'Red + black, dramatic shadows, cinematic feel', inspiration: 'Netflix', gradient: 'linear-gradient(135deg, #141414 0%, #1F1F1F 50%, #E50914 100%)', mode: 'dark' },
  { id: 'apple-music', name: 'Apple Music', category: 'entertainment', description: 'Pink/red gradients, blur effects, premium feel', inspiration: 'Apple Music', gradient: 'linear-gradient(135deg, #FA2D48 0%, #FC3C44 50%, #FF6B8A 100%)', mode: 'auto' },
  { id: 'youtube-vibrant', name: 'YouTube Vibrant', category: 'entertainment', description: 'Red accent, white/dark adaptive, content-forward', inspiration: 'YouTube', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F9F9F9 50%, #FF0000 100%)', mode: 'auto' },
  { id: 'twitch-purple', name: 'Twitch Purple', category: 'entertainment', description: 'Purple + dark, gaming aesthetic, bold accents', inspiration: 'Twitch', gradient: 'linear-gradient(135deg, #0E0E10 0%, #18181B 50%, #9146FF 100%)', mode: 'dark' },

  // Education (5)
  { id: 'duolingo-playful', name: 'Duolingo Playful', category: 'education', description: 'Green + bright colors, rounded, gamified', inspiration: 'Duolingo', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #58CC02 50%, #FF9600 100%)', mode: 'light' },
  { id: 'khan-academy', name: 'Khan Academy', category: 'education', description: 'Blue + green, clean, educational, accessible', inspiration: 'Khan Academy', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #1865F2 50%, #14BF96 100%)', mode: 'light' },
  { id: 'brilliant', name: 'Brilliant', category: 'education', description: 'Orange accent, dark mode, mathematical precision', inspiration: 'Brilliant', gradient: 'linear-gradient(135deg, #1A1A2E 0%, #252540 50%, #FF8C00 100%)', mode: 'dark' },
  { id: 'anki-scholar', name: 'Anki Scholar', category: 'education', description: 'Minimal blue, card-based, focused, no distractions', inspiration: 'Anki', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 50%, #2196F3 100%)', mode: 'light' },
  { id: 'coursera-academic', name: 'Coursera Academic', category: 'education', description: 'Blue + white, professional, structured, clean', inspiration: 'Coursera', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F7FA 50%, #0056D2 100%)', mode: 'light' },

  // Health & Fitness (5)
  { id: 'apple-fitness', name: 'Apple Fitness', category: 'health', description: 'Neon rings on black, bold gradients, energetic', inspiration: 'Apple Fitness+', gradient: 'linear-gradient(135deg, #000000 0%, #FA114F 50%, #92E82A 100%)', mode: 'dark' },
  { id: 'strava-athletic', name: 'Strava Athletic', category: 'health', description: 'Orange + white, sporty, data-rich, compact', inspiration: 'Strava', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F7F7F7 50%, #FC4C02 100%)', mode: 'light' },
  { id: 'peloton-premium', name: 'Peloton Premium', category: 'health', description: 'Red + black, premium dark, motivational', inspiration: 'Peloton', gradient: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #D0021B 100%)', mode: 'dark' },
  { id: 'myfitnesspal', name: 'MyFitnessPal', category: 'health', description: 'Blue + green, friendly, data-forward, accessible', inspiration: 'MyFitnessPal', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #0070D1 50%, #00B050 100%)', mode: 'light' },
  { id: 'oura-ring', name: 'Oura Ring', category: 'health', description: 'Minimal silver/gray, premium, health-data focused', inspiration: 'Oura Ring', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F8F8F8 50%, #8B8B8B 100%)', mode: 'light' },

  // Lifestyle (5)
  { id: 'airbnb-warm', name: 'Airbnb Warm', category: 'lifestyle', description: 'Coral/pink accent, warm photography, rounded', inspiration: 'Airbnb', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #FF5A5F 50%, #00A699 100%)', mode: 'light' },
  { id: 'pinterest-visual', name: 'Pinterest Visual', category: 'lifestyle', description: 'Red accent, masonry grid, visual-first, clean', inspiration: 'Pinterest', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 50%, #E60023 100%)', mode: 'light' },
  { id: 'ikea-scandinavian', name: 'IKEA Scandinavian', category: 'lifestyle', description: 'Blue + yellow, clean, functional, accessible', inspiration: 'IKEA', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #0058A3 50%, #FFDB00 100%)', mode: 'light' },
  { id: 'muji-minimal', name: 'Muji Minimal', category: 'lifestyle', description: 'Beige + brown, ultra-minimal, Japanese simplicity', inspiration: 'Muji', gradient: 'linear-gradient(135deg, #FAF8F5 0%, #E8E0D5 50%, #8B6F47 100%)', mode: 'light' },
  { id: 'aesop-luxury', name: 'Aesop Luxury', category: 'lifestyle', description: 'Dark green + cream, serif typography, luxury feel', inspiration: 'Aesop', gradient: 'linear-gradient(135deg, #F5F0E8 0%, #2D4A3E 50%, #8B6914 100%)', mode: 'light' },

  // Business (3)
  { id: 'slack-professional', name: 'Slack Professional', category: 'business', description: 'Purple + multicolor, friendly professional, rounded', inspiration: 'Slack', gradient: 'linear-gradient(135deg, #4A154B 0%, #36C5F0 50%, #2EB67D 100%)', mode: 'light' },
  { id: 'salesforce-enterprise', name: 'Salesforce Enterprise', category: 'business', description: 'Blue + white, enterprise, structured, accessible', inspiration: 'Salesforce', gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F3F3F3 50%, #0176D3 100%)', mode: 'light' },
  { id: 'stripe-developer', name: 'Stripe Developer', category: 'business', description: 'Purple gradient, developer-friendly, clean code', inspiration: 'Stripe', gradient: 'linear-gradient(135deg, #635BFF 0%, #0A2540 50%, #635BFF 100%)', mode: 'light' },

  // Creative (3)
  { id: 'figma-vibrant', name: 'Figma Vibrant', category: 'creative', description: 'Multi-color, creative, bold, playful', inspiration: 'Figma', gradient: 'linear-gradient(135deg, #0ACF83 0%, #A259FF 50%, #F24E1E 100%)', mode: 'light' },
  { id: 'procreate-artist', name: 'Procreate Artist', category: 'creative', description: 'Dark canvas, vibrant tool colors, creative workspace', inspiration: 'Procreate', gradient: 'linear-gradient(135deg, #0F0F0F 0%, #1A1A2E 50%, #00D4FF 100%)', mode: 'dark' },
  { id: 'vsco-film', name: 'VSCO Film', category: 'creative', description: 'Muted/desaturated, film aesthetic, minimal UI', inspiration: 'VSCO', gradient: 'linear-gradient(135deg, #F5F5F5 0%, #E0DDD5 50%, #2C2C2C 100%)', mode: 'light' },
];
