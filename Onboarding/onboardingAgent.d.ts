import { StanleyFoundation, AgentConfig } from "../foundationAgent";
export interface LoginCredentials {
    email?: string;
    username?: string;
    password?: string;
}
export interface ExtractedClient {
    name: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    notes: string | null;
}
/**
 * Project Stanley Onboarding Specialist Agent
 *
 * Focuses on programmatically navigating legacy directories (Mindbody, Vagaro),
 * resolving DOM layouts, and extracting customer lists to normalize them into
 * Bridgeway's native Client schemas.
 */
export declare class StanleyOnboardingAgent extends StanleyFoundation {
    constructor(config?: AgentConfig);
    /**
     * Main entrypoint to log in, navigate to directory, traverse access tree, and extract clients.
     */
    extractLegacyData(competitor: 'mindbody' | 'vagaro', loginUrl: string, credentials: LoginCredentials): Promise<ExtractedClient[]>;
    /**
     * Internal DOM compression algorithm.
     * Instead of parsing large, text-heavy HTML source code, it loops through visible
     * semantic elements and strips inline styles, Tailwind utility classes, scripts, and SVGs.
     * Maps interactive elements to sequential ids and outputs a dense JSON tree.
     */
    compressActiveViewportDOM(): Promise<string>;
    /**
     * Helper to perform login based on standard forms of the competitor.
     */
    private performLogin;
    /**
     * Scrapes tabular rows directly from the browser context in-memory.
     */
    private scrapeLegacyDataTables;
    /**
     * Standardizes raw scraped column headers to Bridgeway client properties.
     */
    private normalizeClients;
    /**
     * Helper to recursively scan accessibility tree snapshot nodes for a target role and name regex.
     */
    private findNodeByRoleAndName;
}
