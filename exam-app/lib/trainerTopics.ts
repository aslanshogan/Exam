/** Predefined technical categories for the AI Knowledge Trainer and the
 *  admin AI Question Generator. Custom topics are always allowed too. */
export const TRAINER_TOPICS = [
  "Francis Turbine",
  "Generator",
  "Electrical Systems",
  "Mechanical Systems",
  "I&C / Instrumentation and Control",
  "Controllers / RTU / PLC / MFC 3000",
  "Protection and Safety",
  "Wind Turbines",
  "Gas Turbines",
  "Steam Turbines",
  "Hydropower",
  "Pumped-Storage Plants",
  "Power Generation Basics",
  "Grid Synchronization",
  "Modbus / Industrial Communication",
  "VFD / Motor Control",
  "Mixed Technical Knowledge",
] as const;

export const DIFFICULTY_OPTIONS = ["easy", "medium", "hard", "mixed"] as const;
export type Difficulty = (typeof DIFFICULTY_OPTIONS)[number];
