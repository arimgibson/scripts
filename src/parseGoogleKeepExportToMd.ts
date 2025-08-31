/**
 * Google Keep Export to Markdown Converter
 * ========================================
 *
 * This script converts Google Keep notes exported as JSON files into organized Markdown files.
 * It processes notes from a Google Keep export directory and organizes them into three categories:
 * - Active notes (unsorted)
 * - Archived notes
 * - Trashed notes
 *
 * HOW TO USE:
 * ===========
 *
 * 1. EXPORT YOUR GOOGLE KEEP DATA: https://support.google.com/keep/answer/10017039?hl=en
 *
 * 2. CONFIGURE THE SCRIPT:
 *    - Update the `noteInputDir` constant to point to your extracted Keep directory
 *    - Update the `noteOutputDir` constant to specify where you want the Markdown files
 *    - Set `dryRun = true` to test without making changes
 *    - Set `testOneNote = true` to process only the first note for testing
 *    - Set `shouldDeleteOriginalNotes` to choose whether to delete the original JSON files after conversion
 *
 * 3. RUN THE SCRIPT:
 *    - Run: bun run src/parseGoogleKeepExportToMd.ts
 *
 * WHAT THE SCRIPT DOES:
 * ====================
 *
 * - Reads all JSON files from the input directory
 * - Converts each note to Markdown format with:
 *   - Note title as H1 heading
 *   - Note content as body text
 *   - Metadata section with timestamps and other properties
 * - Organizes notes into subdirectories based on their status:
 *   - `unsorted/` - Active notes
 *   - `archive/` - Archived notes
 *   - `trash/` - Trashed notes
 * - Optionally deletes the original JSON files after conversion
 *
 * CONFIGURATION OPTIONS:
 * =====================
 *
 * - `dryRun`: Set to true to see what would happen without making changes
 * - `testOneNote`: Set to true to process only the first note for testing
 * - `propertiesToIgnore`: Properties from Google Keep that won't be included in metadata
 * - `orderedProperties`: Properties that will appear first in the metadata section
 *
 * OUTPUT STRUCTURE:
 * ================
 *
 * Each Markdown file contains:
 * - H1 heading with the note title
 * - Note content (textContent from Google Keep)
 * - Metadata section with timestamps, labels, and other properties
 */

import { readdir } from "node:fs/promises";

// #region const definitions
const dryRun = false;
const testOneNote = false;
const shouldDeleteOriginalNotes = false;
const propertiesToIgnore = [
	"color",
	"isTrashed",
	"isPinned",
	"isArchived",
	"textContent",
	"textContentHtml",
];
const orderedProperties = [
	"title",
	"createdTimestampUsec",
	"userEditedTimestampUsec",
];
const noteInputDir = "/home/ari/downloads/Keep";
const noteOutputDir = `./private-data/outputs/parseGoogleKeepExportToMd-${Date.now()}`;
// #endregion

// Setting an "AnyType" to biome-ignore once instead of every line that could potentially be an AnyType
// biome-ignore lint/suspicious/noExplicitAny: data from Google Keep is not typed
type AnyType = any;

// #region file operations
const notes = await readdir(noteInputDir);

const jsonNotes = notes.filter((note) => note.endsWith(".json"));
const notesToProcess = testOneNote ? [jsonNotes[0]] : jsonNotes;

let notesArchivedCount = 0;
let notesTrashedCount = 0;
let notesUnsortedCount = 0;

for (const note of notesToProcess) {
	const notePath = `${noteInputDir}/${note}`;
	console.log(`Processing note: ${note}`);

	const noteFile = Bun.file(notePath);
	const noteJson = await noteFile.json();
	if (!noteJson.title || noteJson.title === "") {
		noteJson.title = note;
	}
	noteJson.title = normalizeTitle(noteJson.title);
	const { isArchived, isTrashed, title } = noteJson;

	const markdown = convertNoteToMarkdown(noteJson);
	console.log(`  Note converted to markdown: ${title}`);
	console.log(`  ${title}: ${markdown}`);

	if (isTrashed) {
		notesTrashedCount++;
		console.log("  Note is trashed, moving to trash directory");
		if (!dryRun) {
			await Bun.write(`${noteOutputDir}/trash/${title}.md`, markdown);
		} else {
			console.log("  DRY RUN: Would move note to trash directory");
		}
	} else if (isArchived) {
		notesArchivedCount++;
		console.log("  Note is archived, moving to archive directory");
		if (!dryRun) {
			await Bun.write(`${noteOutputDir}/archive/${title}.md`, markdown);
		} else {
			console.log("  DRY RUN: Would move note to archive directory");
		}
	} else {
		notesUnsortedCount++;
		console.log(
			"  Note is not archived or trashed, moving to unsorted output directory",
		);
		if (!dryRun) {
			await Bun.write(`${noteOutputDir}/unsorted/${title}.md`, markdown);
		} else {
			console.log("  DRY RUN: Would move note to unsorted output directory");
		}
	}

	if (shouldDeleteOriginalNotes) {
		if (!dryRun) {
			console.log(`  Deleting note: ${title}`);
			await noteFile.delete();
		} else {
			console.log(`  DRY RUN: Would delete note: ${title}`);
		}
	}
}
// #endregion

console.log(`Notes total: ${jsonNotes.length}`);
console.log(`Notes archived: ${notesArchivedCount}`);
console.log(`Notes trashed: ${notesTrashedCount}`);

// #region util functions
function convertNoteToMarkdown(noteJson: Record<string, AnyType>) {
	const metadata: Set<Record<string, AnyType>> = recursivelyGetProperties(
		noteJson,
		new Set(),
	);

	let markdown = `# ${noteJson.title}\n\n`;
	markdown += `${noteJson.textContent}\n`;

	if (metadata) {
		const orderedMetadata = orderMetadata(metadata);
		markdown += "\n## Metadata from Google Keep\n";
		for (const [key, value] of Object.entries(orderedMetadata)) {
			const formatted = formatMetadataValue(value);
			markdown += `*${key}*: ${formatted}\n`;
		}
	}

	return markdown;
}

function formatMetadataValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function recursivelyGetProperties(
	inputObj: Record<string, AnyType>,
	accProperties: Set<Record<string, AnyType>>,
	propertyName?: string,
) {
	for (const property of Object.keys(inputObj)) {
		if (propertiesToIgnore.includes(property)) continue;

		const value = inputObj[property];
		const currentPath = propertyName ? `${propertyName}.${property}` : property;

		if (value !== null && typeof value === "object") {
			// Do not add parent object to metadata; only add leaf values
			recursivelyGetProperties(value, accProperties, currentPath);
		} else {
			accProperties.add({ [currentPath]: value });
		}
	}

	return accProperties;
}

function orderMetadata(
	metadata: Set<Record<string, AnyType>>,
): Record<string, AnyType> {
	// Pre-compute the order lookup for better performance
	const orderMap = new Map<string, number>();
	orderedProperties.forEach((prop, index) => orderMap.set(prop, index));

	const sorted = Array.from(metadata).sort((a, b) => {
		const aKey = Object.keys(a)[0];
		const bKey = Object.keys(b)[0];

		if (!aKey || !bKey)
			throw new Error("Invalid metadata -- aKey or bKey is undefined");

		const aSortKey = orderMap.get(aKey) ?? -1;
		const bSortKey = orderMap.get(bKey) ?? -1;

		if (aSortKey !== -1 && bSortKey !== -1) {
			return aSortKey - bSortKey;
		}

		if (aSortKey !== -1) return -1;
		if (bSortKey !== -1) return 1;

		return aKey.localeCompare(bKey, undefined, {
			numeric: true,
			sensitivity: "base",
		});
	});

	const result: Record<string, AnyType> = {};
	for (const item of sorted) {
		const key = Object.keys(item)[0];
		if (!key) throw new Error("Invalid metadata -- key is undefined");
		result[key] = item[key];
	}
	return result;
}

function normalizeTitle(title: string): string {
	return title.replace(/\/|\\|\:|\?/g, "_");
}
// #endregion
