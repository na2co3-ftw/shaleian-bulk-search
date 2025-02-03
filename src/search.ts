import {
    Word as SoxsotWord,
    NormalParameter,
    type Suggestion,
    MarkupResolver,
    Parser
} from "soxsot";
import { StringNormalizer } from "soxsot/dist/util/string-normalizer.js";
import type { Dictionary } from "./dictionary.ts";
import type { Token } from "./split.ts";

export interface DictionaryWord {
    type: "dictionary";
    word: SoxsotWord;
    category?: string,
    inflectionTags?: string[]
}

export interface GeneratedEquivalent {
    readonly category: string;
    readonly frame: string | null;
    readonly names: string | null;
}

export interface GeneratedWord {
    type: "generated";
    name: string;
    equivalents: GeneratedEquivalent[];
    notShowAsGenerated?: boolean;
}

export type Word = DictionaryWord | GeneratedWord;

const simpleParser = new Parser(MarkupResolver.createSimple());

export function searchAndGenerateWords(dictionary: Dictionary, token: Token, ignoreDiacritic: boolean): Word[] {
    const { name, afterFek } = token;
    if (name.startsWith("ʻ")) {
        const stem = name.substring(1);
        if (stem == "") {
            return [];
        }

        const words: Word[] = [];
        for (const word of searchWords(dictionary, stem, false, ignoreDiacritic)) {
            const sort = simpleParser.lookupSort(word.word, "ja");
            if (sort?.startsWith("名")) {
                word.category = "名固";
                words.push(word);
            }
        }

        if (words.length == 0) {
            words.push({
                type: "generated",
                name: stem.toLowerCase(),
                equivalents: [{ category: "名固", frame: null, names: null }]
            });
        }

        return words;
    }

    const words: Word[] = [];
    const normalWords = searchWords(dictionary, name, !afterFek, ignoreDiacritic);
    words.push(...replaceAbbreviations(normalWords, dictionary));

    words.push(...generateNumerals(dictionary, name, !afterFek, ignoreDiacritic));

    if (/^[\d\s]*(·\s*\d[\d\s]*)?$/u.test(name)) {
        const number = name.replace(/\s+/g, "").replace(/·/g, ".");
        const adjEquivalent = { category: "形", frame: "/†/", names: number };
        const nounEquivalent = { category: "名", frame: null, names: number };
        words.push({ type: "generated", name, equivalents: [adjEquivalent, nounEquivalent] });
    }

    return words;
}

const INFLECTION_KIND_TO_SORT_ABBREV: Record<string, string> = {
    "verbalInflection": "動",
    "nominalInflection": "名",
    "adpredicativeInflection": "述",
    "specialInflection": "特",
    "particleInflection": "助"
};

function searchWords(dictionary: Dictionary, name: string, withInflections: boolean, ignoreDiacritic: boolean): DictionaryWord[] {
    const parameter = new NormalParameter(name, "name", "exact", "ja",
        { diacritic: ignoreDiacritic, case: true, space: false, wave: false });
    const result = dictionary.search(parameter);

    const words: DictionaryWord[] = [];
    if (!withInflections) {
        for (const word of result.words) {
            words.push({ type: "dictionary", word });
        }
        return words;
    }

    for (const word of result.words) {
        const sort = simpleParser.lookupSort(word, "ja");
        const { category, inflectionTags } = parseInflection(null, sort, word.uniqueName);
        words.push({
            type: "dictionary",
            word,
            category: category ?? undefined,
            inflectionTags
        });
    }

    const inflections = result.suggestions.filter(suggestion => suggestion.kind != "revision");
    for (const inflection of inflections) {
        const parameter = new NormalParameter(inflection.names[0], "name", "exact", "ja",
            { diacritic: false, case: false, space: false, wave: false });
        const result = dictionary.search(parameter);

        const expectedSort = INFLECTION_KIND_TO_SORT_ABBREV[inflection.kind];
        for (const word of result.words) {
            const sort = simpleParser.lookupSort(word, "ja");
            if (sort?.startsWith(expectedSort) != true) {
                continue;
            }
            const { category, inflectionTags } = parseInflection(inflection, sort, word.uniqueName);
            words.push({
                type: "dictionary",
                word,
                category: category ?? undefined,
                inflectionTags
            });
        }
    }

    return words;
}

const CATEGORY_TO_ABBREV: Record<string, string> = {
    "verb": "動",
    "adjective": "形",
    "adverb": "副",
    "noun": "名",
    "adpredicative": "述",
    "special": "特"
};

const TENSE_DISPLAY: Record<string, string> = {
    "present": "現在",
    "past": "過去",
    "future": "未来",
    "diachronic": "通時"
};

const ASPECT_DISPLAY: Record<string, string> = {
    "inceptive": "開始",
    "progressive": "経過",
    "perfect": "完了",
    "continuous": "継続",
    "indefinite": "無相"
};

function parseInflection(suggestion: Suggestion | null, sort: string | null | undefined, uniqueName: string)
    : { category: string | null, inflectionTags: string[] } {
    const descriptionMap = new Map(suggestion?.descriptions.map(x => [x.kind, x.type]))
    const tags: string[] = [];

    let category = descriptionMap.get("category") ?? null;
    if (category == null) {
        if (sort && (sort.startsWith("動") || sort.startsWith("名"))) {
            category = "noun";
        }
    } else if (category == "nonverbAdverb") {
        tags.push("非動詞修飾");
        category = "adverb"
    } else if (category == "nonverbAdpredicative") {
        tags.push("非動詞修飾");
        category = "adpredicative"
    }
    let categoryAbbrev = category == null ? null : CATEGORY_TO_ABBREV[category];

    if (descriptionMap.get("form") == "nonverb" || uniqueName == "i") {
        tags.push("非動詞修飾");
    }

    if (descriptionMap.get("polarity") == "negative") {
        tags.push("否定");
    }

    const tense = descriptionMap.get("tense");
    if (tense != null) {
        tags.push(TENSE_DISPLAY[tense]);
    }

    const aspect = descriptionMap.get("aspect");
    if (aspect != null) {
        tags.push(ASPECT_DISPLAY[aspect]);
    }

    if (descriptionMap.get("voice") == "adjutative") {
        tags.push("補助");
    }

    return { category: categoryAbbrev, inflectionTags: tags }
}

function replaceAbbreviations(words: DictionaryWord[], dictionary: Dictionary): Word[] {
    return words.flatMap<Word>(word => {
        if (!word.word.name.includes("’")) {
            return word;
        }

        const equivalents = word.word.equivalentNames["ja"];
        if (equivalents?.every(e => !e.includes(" "))) {
            const longWords : Word[] = [];
            for (const longName of equivalents) {
                const longWord = searchWords(dictionary, longName, true, false)[0] as DictionaryWord | undefined;
                if (!longWord) {
                    continue;
                }

                longWord.word = new SoxsotWord(
                    word.word.uniqueName,
                    longWord.word.date,
                    longWord.word.contents
                );
                longWords.push(longWord);
            }

            if (longWords.length == 0) {
                return word;
            }
            return longWords;
        }

        if (word.word.uniqueName == "al’") {
            return {
                type: "generated",
                name: word.word.name,
                equivalents: [{ category: "縮", frame: "/†/", names: "〜個の, 〜人の" }]
            }
        }
        if (word.word.uniqueName == "ac’") {
            return {
                type: "generated",
                name: word.word.name,
                equivalents: [{ category: "縮", frame: "/†/", names: "〜番目の, 〜回目の, 〜番の, 〜位の" }]
            }
        }
        if (word.word.uniqueName == "s’") {
            return {
                type: "generated",
                name: word.word.name,
                equivalents: [{ category: "縮", frame: "それは /e/ で", names: "ある" }]
            }
        }

        return word;
    });
}

const DIGIT_POSITIONS: Record<string, number | undefined> = {
    "et": 1,
    "il": 2,
    "as": 3
};

const DIGIT_SUFFIX: Record<string, string | undefined> = {
    "": "",
    "otik": "万",
    "oqek": "億",
    "oyok": "兆",
    "opik": "京",
    "oxak": "垓"
};

const DECIMAL_DIGIT_SUFFIX: Record<string, string | undefined> = {
    "": ".",
    "otik": ".0000",
    "oqek": ".00000000",
    "oyok": ".000000000000",
    "opik": ".0000000000000000",
    "oxak": ".00000000000000000000"
};

function generateNumerals(dictionary: Dictionary, name: string, withInflections: boolean, ignoreDiacritic: boolean): Word[] {
    const normalizedName = StringNormalizer.normalize(name,
        { diacritic: ignoreDiacritic, case: true, space: false, wave: false });
    if (!/^[a-zA-Z]+$/.test(normalizedName)) {
        return [];
    }

    const numerals: Word[] = [];

    if (!withInflections || normalizedName.startsWith("a")) {
        const verbalStem = withInflections ? normalizedName.substring(1) : normalizedName;

        const number = parseNumeral(dictionary, verbalStem, false, false);
        if (number != null) {
            numerals.push({
                type: "generated",
                name: verbalStem,
                equivalents: [{ category: "形", frame: "/†/", names: number }],
                notShowAsGenerated: verbalStem.length == 3
            });
        }
        const decimal = parseNumeral(dictionary, verbalStem, false, true);
        if (decimal != null) {
            numerals.push({
                type: "generated",
                name: verbalStem,
                equivalents: [{ category: "形", frame: "/†/", names: decimal }],
                notShowAsGenerated: verbalStem.length == 3
            });
        }
    }

    if (!withInflections || !normalizedName.startsWith("a")) {
        const nominalStem = normalizedName;

        const number = parseNumeral(dictionary, nominalStem, true, false);
        if (number != null) {
            numerals.push({
                type: "generated",
                name: nominalStem,
                equivalents: [{ category: "名", frame: null, names: number }],
                notShowAsGenerated: nominalStem.length == 3
            });
        }
        const decimal = parseNumeral(dictionary, nominalStem, true, true);
        if (decimal != null) {
            numerals.push({
                type: "generated",
                name: nominalStem,
                equivalents: [{ category: "名", frame: null, names: decimal }],
                notShowAsGenerated: nominalStem.length == 33
            });
        }
    }

    return numerals;
}

function parseNumeral(dictionary: Dictionary, stem: string, isNominal: boolean, isDecimal: boolean): string | null {
    const digitMap = !isNominal ?
        (!isDecimal ? dictionary.verbalDigits : dictionary.verbalDecimalDigits) :
        (!isDecimal ? dictionary.nominalDigits : dictionary.nominalDecimalDigits);

    let rest = stem;

    const digits: (string | null)[] = [null, null, null, null];
    let hasDigit = false;
    while (true) {
        const digitName = rest.substring(0, 3);
        const digit = digitMap.get(digitName);
        if (digit == undefined) {
            break;
        }
        rest = rest.substring(3);

        const digitPositionName = rest.substring(0, 2);
        const digitPosition = DIGIT_POSITIONS[digitPositionName] ?? 0;
        if (digitPosition != 0) {
            rest = rest.substring(2);
        }

        if (digits[digitPosition] != null) {
            return null;
        }
        digits[digitPosition] = digit;
        hasDigit = true;
    }
    if (!hasDigit) {
        return null;
    }

    const suffix = (!isDecimal ? DIGIT_SUFFIX : DECIMAL_DIGIT_SUFFIX)[rest];
    if (suffix == undefined) {
        return null;
    }

    const numberTexts: string[] = [];
    for (let i = digits.length - 1; i >= 0; i--) {
        const digit = digits[i];
        if (digit != null || numberTexts.length != 0) {
            numberTexts.push(digit ?? "0");
        }
    }
    numberTexts.push(suffix);
    if (isDecimal) {
        numberTexts.reverse()
    }
    return numberTexts.join("");
}
