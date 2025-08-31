/**
 * LinkedIn Recruiter Contact Scraping Tool
 * ========================================
 *
 * This script extracts contact information from LinkedIn profiles using the Unipile API.
 * It processes a list of LinkedIn URLs and extracts key information including names, emails,
 * phone numbers, and current company roles. Originally written to catalog network of recruiters.
 *
 * HOW TO USE:
 * ===========
 *
 * 1. SETUP ENVIRONMENT VARIABLES:
 *    - Set UNIPILE_DSN (your Unipile data source name)
 *    - Set UNIPILE_API_KEY (your Unipile API key)
 *    - Set UNIPILE_ACCOUNT_ID (your Unipile account identifier)
 *
 * 2. PREPARE INPUT DATA:
 *    - Create a JSON file at `private-data/inputs/recruiterContactScraping.json`
 *    - Add LinkedIn profile URLs as an array of strings
 *    - Example: ["https://www.linkedin.com/in/username1", "https://www.linkedin.com/in/username2"]
 *
 * 3. RUN THE SCRIPT:
 *    - Run: bun run src/recruiterContactScraping.ts
 *
 * WHAT THE SCRIPT DOES:
 * ====================
 *
 * - Reads LinkedIn profile URLs from the input JSON file
 * - Fetches profile data using the Unipile LinkedIn API
 * - Extracts and formats the following information:
 *   - Full name (first + last name)
 *   - LinkedIn profile URL
 *   - Email addresses (normalized to lowercase)
 *   - Phone numbers (formatted to US standard format)
 *   - Current company and role
 * - Saves results to a timestamped JSON file in the outputs directory
 * - Includes rate limiting (5-6 second delays between requests)
 *
 * OUTPUT STRUCTURE:
 * ================
 *
 * Each output record contains:
 * - fullName: Combined first and last name, or null if unavailable
 * - profileUrl: LinkedIn profile URL
 * - emails: Array of email addresses (lowercase)
 * - phones: Array of formatted phone numbers
 * - currentCompanyRole: Company name and position, or null if unavailable
 */

import { phone } from "phone";
import { UnipileClient } from "unipile-node-sdk";

type OutputItem = {
	fullName: string | null;
	profileUrl: string | null;
	emails: string[];
	phones: string[];
	currentCompanyRole: string | null;
};

const { UNIPILE_DSN, UNIPILE_API_KEY, UNIPILE_ACCOUNT_ID } = process.env;

if (!UNIPILE_DSN || !UNIPILE_API_KEY || !UNIPILE_ACCOUNT_ID) {
	throw new Error("Missing environment variables");
}

const unipileClient = new UnipileClient(UNIPILE_DSN, UNIPILE_API_KEY);

const recruiterLinkedInURLs: string[] = await Bun.file(
	"private-data/inputs/recruiterContactScraping.json",
).json();
const outputData: OutputItem[] = [];

for (const url of recruiterLinkedInURLs) {
	const profileUrn = url.split("/in/")[1];

	if (!profileUrn) {
		console.log(`Invalid LinkedIn URL: ${url}`);
		continue;
	}

	try {
		const contact = await unipileClient.users.getProfile({
			account_id: UNIPILE_ACCOUNT_ID,
			identifier: profileUrn,
			linkedin_sections: ["experience"],
		});

		if (
			contact.provider === "LINKEDIN" &&
			typeof contact.public_identifier === "string"
		) {
			outputData.push({
				fullName:
					contact.first_name && contact.last_name
						? `${contact.first_name} ${contact.last_name}`
						: null,
				profileUrl:
					`https://www.linkedin.com/in/${contact.public_identifier}` || null,
				emails:
					contact.contact_info?.emails?.map((email) => email.toLowerCase()) ||
					[],
				phones:
					contact.contact_info?.phones
						?.map((phoneNum) => formatPhoneNumber(phoneNum))
						.filter((phoneNum) => phoneNum !== null) || [],
				currentCompanyRole:
					contact.work_experience?.[0]?.company &&
					contact.work_experience?.[0]?.position
						? `${contact.work_experience?.[0]?.company} - ${contact.work_experience?.[0]?.position}`
						: null,
			});
			console.log(`Record added for ${url}`);
		} else {
			const isLinkedInProvider = contact.provider === "LINKEDIN";
			console.warn(`Record is not valid for ${url}`, {
				isLinkedInProvider,
				hasProfileUrl: isLinkedInProvider
					? typeof contact?.profile_picture_url === "string"
					: null,
			});
		}

		await Bun.sleep(5000 + Math.random() * 1000);
	} catch (error) {
		console.error(`Error fetching profile for ${url}:`, error);
	}
}

await Bun.write(
	`private-data/outputs/recruiterContactScraping-${Date.now()}.json`,
	JSON.stringify(outputData, null, 2),
);
console.log("Done!");

function formatPhoneNumber(phoneNumber: string): string | null {
	const parsingRes = phone(phoneNumber);

	if (!parsingRes.isValid) {
		return null;
	}

	return parsingRes.phoneNumber
		.replace(/^\+1/, "")
		.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
}
