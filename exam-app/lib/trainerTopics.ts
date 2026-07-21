/**
 * Predefined technical topics for the AI Knowledge Trainer and the admin
 * AI Question Generator, organized into DISCIPLINE GROUPS. Custom topics
 * are always allowed too.
 *
 * TRAINER_TOPIC_GROUPS drives the grouped dropdowns (rendered as
 * <optgroup>s). TRAINER_TOPICS is the flat list of every topic, kept for
 * backward compatibility with code that imports it.
 */
export const TRAINER_TOPIC_GROUPS: { group: string; topics: string[] }[] = [
  {
    group: "Hydro & Turbines",
    topics: [
      "Francis Turbine",
      "Kaplan Turbine",
      "Pelton Turbine",
      "Hydro Turbine General",
      "Governor & Speed Control",
      "Draft Tube & Cavitation",
      "Hydropower Plant Operation",
      "Pumped-Storage Plants",
    ],
  },
  {
    group: "Generator & Electrical",
    topics: [
      "Generator",
      "Excitation Systems",
      "Electrical Systems",
      "Transformers",
      "Switchgear & Busbars",
      "Grid Synchronization",
      "VFD / Motor Control",
      "Protection Relays",
    ],
  },
  {
    group: "Mechanical Systems",
    topics: [
      "Mechanical Systems",
      "Bearings & Lubrication",
      "Pumps & Valves",
      "Cooling Water Systems",
      "Hydraulics & Pneumatics",
      "Vibration & Alignment",
    ],
  },
  {
    group: "I&C / Controls",
    topics: [
      "I&C / Instrumentation and Control",
      "Controllers / RTU / PLC / MFC 3000",
      "SCADA & HMI",
      "Sensors & Transmitters",
      "Modbus / Industrial Communication",
      "Control Loops & PID",
    ],
  },
  {
    group: "Protection & Safety",
    topics: [
      "Protection and Safety",
      "Fire Fighting Systems",
      "Fire Detection & Alarm",
      "Emergency Shutdown",
      "Lockout / Tagout (LOTO)",
      "Personal Protective Equipment",
      "Electrical Safety",
    ],
  },
  {
    group: "Other Power Generation",
    topics: [
      "Power Generation Basics",
      "Wind Turbines",
      "Gas Turbines",
      "Steam Turbines",
      "Boilers & Steam Systems",
      "Mixed Technical Knowledge",
    ],
  },
];

export const TRAINER_TOPICS = TRAINER_TOPIC_GROUPS.flatMap((g) => g.topics);

export const DIFFICULTY_OPTIONS = ["easy", "medium", "hard", "mixed"] as const;
export type Difficulty = (typeof DIFFICULTY_OPTIONS)[number];
