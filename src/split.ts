import type { Dictionary } from "./dictionary.ts";

export interface Token {
    input: string;
    name: string;
    afterFek: boolean;
}

export function splitToTokens(dictionary: Dictionary, sentence: string): Token[] {
    const abbreviationRegex = dictionary.abbreviations
        .map(abbrev =>
            abbrev.endsWith("’") ? String.raw`${abbrev}|` : String.raw`${abbrev}(?!\p{L})|`
        ).join("");
    const wordRegex = new RegExp(String.raw`(${abbreviationRegex}\+?\p{L}+\+?|’|[\d·][\d·\u202f]*)`, "igu");

    const normalizedSentence = sentence.trim().normalize("NFC").replaceAll("'", "’");
    const splitted = normalizedSentence.split(wordRegex);

    const tokens: Token[] = [];
    let prefix = splitted[0].trimStart();
    let fek = false;
    for (let i = 1; i < splitted.length - 1; i++) {
        if (i % 2 != 0) {
            // 語
            tokens.push({
                input: prefix + splitted[i],
                name: splitted[i],
                afterFek: fek
            });
            prefix = "";
            fek = false;
        } else {
            // 約物とスペース
            if (/^\s*$/.test(splitted[i])) {
                continue;
            }

            if (/^\S*$/.test(splitted[i])) {
                tokens[tokens.length - 1].input += splitted[i];
                fek = splitted[i] == "-";
                continue;
            }

            const reversed = splitted[i].split("").reverse().join("");
            const match = reversed.match(/^(\S*)\s*([\s\S]*)$/);
            if (match == null) {
                continue;
            }
            tokens[tokens.length - 1].input += match[2].split("").reverse().join("");
            prefix = match[1].split("").reverse().join("");
        }
    }
    if (tokens.length > 0) {
        tokens[tokens.length - 1].input += splitted[splitted.length - 1].trimEnd();
    }

    return tokens;
}
