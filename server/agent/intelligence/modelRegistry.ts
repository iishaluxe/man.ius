import { cloneModelProfile, validateModelProfile, type ModelProfile } from "./modelProfile";

export class ModelRegistry {
  private readonly profiles = new Map<string, ModelProfile>();

  register(profile: ModelProfile): void {
    const validated = validateModelProfile(profile);
    if (this.profiles.has(validated.id)) throw new Error(`Model profile already registered: ${validated.id}`);
    this.profiles.set(validated.id, cloneModelProfile(validated));
  }

  replace(profile: ModelProfile): void {
    const validated = validateModelProfile(profile);
    if (!this.profiles.has(validated.id)) throw new Error(`Cannot replace missing model profile: ${validated.id}`);
    this.profiles.set(validated.id, cloneModelProfile(validated));
  }

  remove(modelId: string): boolean {
    return this.profiles.delete(modelId);
  }

  get(modelId: string): ModelProfile | undefined {
    const profile = this.profiles.get(modelId);
    return profile ? cloneModelProfile(profile) : undefined;
  }

  require(modelId: string): ModelProfile {
    const profile = this.get(modelId);
    if (!profile) throw new Error(`Model profile not found: ${modelId}`);
    return profile;
  }

  list(options: { enabledOnly?: boolean } = {}): ModelProfile[] {
    return Array.from(this.profiles.values())
      .filter(profile => !options.enabledOnly || profile.enabled)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneModelProfile);
  }

  has(modelId: string): boolean {
    return this.profiles.has(modelId);
  }
}
