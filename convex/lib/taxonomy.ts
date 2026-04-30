export type FlavorKind = "type" | "theme" | "occasion" | "format" | "other";

export type DefaultFlavor = {
  name: string;
  slug: string;
  description: string;
  kind: FlavorKind;
  color: string;
  icon: string;
  aliases: string[];
  sortOrder: number;
};

export type DefaultAudience = {
  name: string;
  slug: string;
  aliases: string[];
  sortOrder: number;
};

export const DEFAULT_FLAVORS: DefaultFlavor[] = [
  {
    name: "Jokes",
    slug: "jokes",
    description: "Funny lines, jokes, and playful wording.",
    kind: "type",
    color: "#FFEE00",
    icon: "ha",
    aliases: ["joke", "funny"],
    sortOrder: 10,
  },
  {
    name: "Messages",
    slug: "messages",
    description: "Ready-to-use wording for cards, posts, texts, and notes.",
    kind: "type",
    color: "#FFD9F7",
    icon: "msg",
    aliases: ["message", "wishes", "greetings"],
    sortOrder: 20,
  },
  {
    name: "Poems",
    slug: "poems",
    description: "Rhyming, verse, and poetic wording ideas.",
    kind: "format",
    color: "#D8E8FF",
    icon: "poem",
    aliases: ["poem", "verse", "poetry"],
    sortOrder: 30,
  },
  {
    name: "Quotes",
    slug: "quotes",
    description: "Quotable lines, sayings, and short shareable phrases.",
    kind: "format",
    color: "#C8F0E8",
    icon: "quote",
    aliases: ["quote", "saying", "sayings"],
    sortOrder: 40,
  },
  {
    name: "Congratulations",
    slug: "congratulations",
    description: "Celebration wording for milestones and achievements.",
    kind: "occasion",
    color: "#FFD8B8",
    icon: "win",
    aliases: ["congrats", "celebration", "celebrate"],
    sortOrder: 50,
  },
  {
    name: "Birthday",
    slug: "birthday",
    description: "Birthday wording, poems, cards, and wishes.",
    kind: "occasion",
    color: "#F0D8D8",
    icon: "bday",
    aliases: ["birthdays"],
    sortOrder: 60,
  },
  {
    name: "Romance",
    slug: "romance",
    description: "Love, relationships, and romantic wording ideas.",
    kind: "theme",
    color: "#FF00DD",
    icon: "love",
    aliases: ["love", "relationship", "relationships", "romantic"],
    sortOrder: 70,
  },
  {
    name: "Work",
    slug: "work",
    description: "Professional, service, career, and workplace wording.",
    kind: "theme",
    color: "#E8D8C0",
    icon: "work",
    aliases: ["career", "professional", "service"],
    sortOrder: 80,
  },
  {
    name: "Song Ideas",
    slug: "song-ideas",
    description: "Song, lyric, and tune ideas for messages.",
    kind: "format",
    color: "#D4C8E8",
    icon: "song",
    aliases: ["song", "songs", "lyrics", "tune"],
    sortOrder: 90,
  },
  {
    name: "Posters",
    slug: "posters",
    description: "Poster-style wording and media ideas.",
    kind: "format",
    color: "#F0F0D8",
    icon: "poster",
    aliases: ["poster", "meme", "memes"],
    sortOrder: 100,
  },
  {
    name: "Ideas",
    slug: "ideas",
    description: "Meta ideas, bylines, suggestions, and improvements.",
    kind: "type",
    color: "#D8F0D8",
    icon: "!",
    aliases: ["idea", "improvements", "features"],
    sortOrder: 110,
  },
  {
    name: "Other",
    slug: "other",
    description: "Everything still waiting for the right flavour.",
    kind: "other",
    color: "#E6E6DE",
    icon: "?",
    aliases: ["misc"],
    sortOrder: 999,
  },
];

export const DEFAULT_AUDIENCES: DefaultAudience[] = [
  { name: "Friend", slug: "friend", aliases: ["friends"], sortOrder: 10 },
  { name: "Partner", slug: "partner", aliases: ["wife", "husband", "girlfriend", "boyfriend"], sortOrder: 20 },
  { name: "Family", slug: "family", aliases: ["mum", "mom", "dad", "parents", "grandparents"], sortOrder: 30 },
  { name: "Kids", slug: "kids", aliases: ["child", "children", "son", "daughter", "baby"], sortOrder: 40 },
  { name: "Coworker", slug: "coworker", aliases: ["colleague", "workmate", "boss"], sortOrder: 50 },
  { name: "Teacher", slug: "teacher", aliases: ["teachers", "school"], sortOrder: 60 },
  { name: "Student", slug: "student", aliases: ["students", "college", "university", "uni"], sortOrder: 70 },
  { name: "Everyone", slug: "everyone", aliases: ["anyone", "general"], sortOrder: 999 },
];

export function inferFlavorSlug(name: string | undefined) {
  const value = (name ?? "").toLowerCase();
  if (!value.trim()) return "other";
  if (/\bjoke|funny|humou?r\b/.test(value)) return "jokes";
  if (/\bpoem|poetic|verse|rhyme\b/.test(value)) return "poems";
  if (/\bquote|saying|wisdom\b/.test(value)) return "quotes";
  if (/\bcongrat|congrats|graduation|promotion|achievement|anniversary|phd|degree|accepted|acceptance|engagement|new baby|newborn|service\b/.test(value)) {
    return "congratulations";
  }
  if (/\bbirthday\b/.test(value)) return "birthday";
  if (/\bromantic|love|relationship|women'?s day\b/.test(value)) return "romance";
  if (/\bwork|career|company|professional|service|military\b/.test(value)) return "work";
  if (/\bsong|lyric|tune\b/.test(value)) return "song-ideas";
  if (/\bposter|meme|image\b/.test(value)) return "posters";
  if (/\bfeature|improvement|byline|idea\b/.test(value)) return "ideas";
  if (/\bmessage|card|wish|wishes|wording\b/.test(value)) return "messages";
  return "other";
}

export function inferAudienceSlugs(name: string | undefined) {
  const value = (name ?? "").toLowerCase();
  const slugs = new Set<string>();
  if (/\bfriend|mate\b/.test(value)) slugs.add("friend");
  if (/\bpartner|wife|husband|girlfriend|boyfriend|relationship|romantic\b/.test(value)) slugs.add("partner");
  if (/\bfamily|parent|grandparent|mum|mom|dad|son in law\b/.test(value)) slugs.add("family");
  if (/\bkid|child|children|son|daughter|baby|newborn\b/.test(value)) slugs.add("kids");
  if (/\bcoworker|colleague|boss|work\b/.test(value)) slugs.add("coworker");
  if (/\bteacher|school\b/.test(value)) slugs.add("teacher");
  if (/\bstudent|college|university|uni|academic\b/.test(value)) slugs.add("student");
  return [...slugs];
}
