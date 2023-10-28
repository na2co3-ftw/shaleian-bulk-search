import { Dictionary } from "./dictionary";

export interface Token {
    input: string;
    name: string;
    afterFek: boolean;
}

export function splitToTokens(dictionary: Dictionary, sentence: string): Token[] {
    const abbreviations = dictionary.abbreviations;
    const wordRegex = new RegExp(String.raw`(${abbreviations.join("|")}|\+?\p{L}+\+?|'|[\d·][\d·\u202f]*)`, "gu");
    const splitted = sentence.trim().normalize("NFC").split(wordRegex);

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
