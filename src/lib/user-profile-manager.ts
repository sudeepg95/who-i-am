import type { 
  UserProfile, 
  SkillItem, 
  SkillCategory, 
  ContactMethod,
  NavigationItem,
  PersonalInfo,
  ContactInfo,
  Skills,
  SummaryParts,
  SummaryTextParts
} from '~/types';
import userProfileData from '~/data/user-profile';

export class UserProfileManager {
  private profile: UserProfile;

  constructor(profileData?: UserProfile) {
    this.profile = profileData || (userProfileData as UserProfile);
  }

  getPersonalInfo(): PersonalInfo {
    return this.profile.personal;
  }

  getName(): string {
    return this.profile.personal.name;
  }

  getTitle(): string {
    return this.profile.personal.title;
  }

  getLocation(): string {
    return this.profile.personal.location.displayName;
  }

  getDescription(): string {
    return this.profile.personal.description;
  }

  getSummaryTextParts(): SummaryTextParts {
    return this.profile.personal.summaryParts;
  }

  getSummaryParts(): SummaryParts {
    const focusAreas = this.getFocusAreas();
    const experienceYears = this.getExperienceYears();
    const ordinalInfo = this.getExperienceOrdinalParts(experienceYears);
    const textParts = this.getSummaryTextParts();
    
    return {
      prefix: textParts.prefix,
      highlightText: textParts.highlightText,
      middleText: textParts.middleText,
      focusAreas: focusAreas.map((area, index) => ({
        text: area,
        isLast: index === focusAreas.length - 1,
        isSecondToLast: index === focusAreas.length - 2,
      })),
      betweenText: textParts.betweenText,
      experienceYears,
      experienceNumber: ordinalInfo.number,
      experienceOrdinalSuffix: ordinalInfo.suffix,
      suffix: textParts.suffix,
    };
  }

  private getExperienceOrdinalParts(years: number): { number: number; suffix: string } {
    const lastDigit = years % 10;
    const lastTwoDigits = years % 100;
    
    let suffix: string;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
      suffix = "th";
    } else {
      switch (lastDigit) {
        case 1: suffix = "st"; break;
        case 2: suffix = "nd"; break;
        case 3: suffix = "rd"; break;
        default: suffix = "th"; break;
      }
    }
    
    return { number: years, suffix };
  }

  getExperienceYears(): number {
    return this.profile.personal.experience.years;
  }

  getFocusAreas(): string[] {
    return this.profile.personal.experience.focus;
  }

  getContactInfo(): ContactInfo {
    return this.profile.contact;
  }

  getEmail(): string {
    return this.profile.contact.email;
  }

  getWhatsAppUrl(): string {
    return this.profile.contact.whatsapp.url;
  }

  getWhatsAppNumber(): string {
    return this.profile.contact.whatsapp.number;
  }

  getGitHubUrl(): string {
    return this.profile.contact.social.github.url;
  }

  getLinkedInUrl(): string {
    return this.profile.contact.social.linkedin.url;
  }

  getContactLinks() {
    return [
      {
        url: this.getWhatsAppUrl(),
        description: `${this.getName()} via WhatsApp`,
        icon: "fa-brands:whatsapp",
        type: 'whatsapp' as ContactMethod
      },
      {
        url: `mailto:${this.getEmail()}`,
        description: `${this.getName()} via Email`,
        icon: "fa-solid:envelope",
        type: 'email' as ContactMethod
      },
      {
        url: this.getGitHubUrl(),
        description: `${this.getName()} on GitHub`,
        icon: "fa-brands:github-alt",
        type: 'github' as ContactMethod
      },
      {
        url: this.getLinkedInUrl(),
        description: `${this.getName()} on LinkedIn`,
        icon: "fa-brands:linkedin",
        type: 'linkedin' as ContactMethod
      }
    ];
  }

  getSkills(): Skills {
    return this.profile.skills;
  }

  getSkillsByCategory(category: SkillCategory): SkillItem[] {
    return this.profile.skills[category];
  }

  getAllSkills(): SkillItem[] {
    const { frameworks, programming, tools } = this.profile.skills;
    return [...frameworks, ...programming, ...tools];
  }

  getSkillCategories(): Array<{ title: string; data: SkillItem[]; category: SkillCategory }> {
    return [
      { title: "Frameworks", data: this.profile.skills.frameworks, category: 'frameworks' },
      { title: "Programming", data: this.profile.skills.programming, category: 'programming' },
      { title: "Tools & Others", data: this.profile.skills.tools, category: 'tools' }
    ];
  }

  getNavigationItems(): NavigationItem[] {
    return this.profile.navigation.sections;
  }

  getResumeUrl(): string {
    return this.profile.navigation.resume.url;
  }

  getFullNavigationItems(): NavigationItem[] {
    return [
      ...this.profile.navigation.sections,
      {
        title: this.profile.navigation.resume.title,
        url: this.profile.navigation.resume.url
      }
    ];
  }

  updateProfile(newProfile: Partial<UserProfile>): void {
    this.profile = { ...this.profile, ...newProfile };
  }

  getFullProfile(): UserProfile {
    return this.profile;
  }

  static fromJSON(jsonData: UserProfile): UserProfileManager {
    return new UserProfileManager(jsonData);
  }

  toJSON(): string {
    return JSON.stringify(this.profile, null, 2);
  }
}

export const userProfile = new UserProfileManager();
