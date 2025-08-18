export interface SkillItem {
  title: string;
  icon: string;
  url: string;
}

export interface Location {
  city: string;
  state: string;
  country: string;
  displayName: string;
}

export interface Experience {
  years: number;
  focus: string[];
}

export interface SummaryTextParts {
  prefix: string;
  highlightText: string;
  middleText: string;
  betweenText: string;
  suffix: string;
}

export interface PersonalInfo {
  name: string;
  title: string;
  location: Location;
  description: string;
  summaryParts: SummaryTextParts;
  experience: Experience;
}

export interface WhatsAppContact {
  number: string;
  url: string;
}

export interface SocialProfile {
  username: string;
  url: string;
}

export interface SocialLinks {
  github: SocialProfile;
  linkedin: SocialProfile;
}

export interface ContactInfo {
  email: string;
  whatsapp: WhatsAppContact;
  social: SocialLinks;
}

export interface Skills {
  frameworks: SkillItem[];
  programming: SkillItem[];
  tools: SkillItem[];
}

export interface NavigationItem {
  title: string;
  url: string;
}

export interface ResumeLink {
  url: string;
  title: string;
}

export interface Navigation {
  resume: ResumeLink;
  sections: NavigationItem[];
}

export interface UserProfile {
  personal: PersonalInfo;
  contact: ContactInfo;
  skills: Skills;
  navigation: Navigation;
}

export type SkillCategory = keyof Skills;
export type ContactMethod = 'email' | 'whatsapp' | 'github' | 'linkedin';

export interface SummaryParts {
  prefix: string;
  highlightText: string;
  middleText: string;
  focusAreas: Array<{
    text: string;
    isLast: boolean;
    isSecondToLast: boolean;
  }>;
  betweenText: string;
  experienceYears: number;
  experienceNumber: number;
  experienceOrdinalSuffix: string;
  suffix: string;
}
