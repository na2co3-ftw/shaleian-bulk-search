import {
    type PlainDictionary,
    Dictionary as SoxsotDictionary,
    type Parameter,
    NormalParameter,
    type SearchResult,
    MarkupResolver,
    Parser
} from "soxsot";

const simpleParser = new Parser(MarkupResolver.createSimple());

export class Dictionary {
    public dictionary: SoxsotDictionary;
    public updatedAt: Date;
    public abbreviations: string[];
    public digits: Map<string, string>;
    public decimalDigits: Map<string, string>;

    constructor(plainDictionary: PlainDictionary, updatedAt: Date) {
        this.dictionary = SoxsotDictionary.fromPlain(plainDictionary);
        this.updatedAt = updatedAt;

        this.abbreviations = this.initAbbreviations();
        [this.digits, this.decimalDigits] = this.initNumerals();
    }

    public search(parameter: Parameter): SearchResult {
        return this.dictionary.search(parameter);
    }

    private initAbbreviations(): string[] {
        const parameter = new NormalParameter("'", "name", "part", "ja",
            { diacritic: false, case: false, space: false, wave: false });
        const result = this.dictionary.search(parameter);
        return result.words.map(word => word.name);
    }

    private initNumerals(): [Map<string, string>, Map<string, string>] {
        const parameter = new NormalParameter(String.raw`^\.?\d$`, "equivalent", "regular", "ja",
            { diacritic: false, case: false, space: false, wave: false });
        const result = this.dictionary.search(parameter);

        const digits = new Map<string, string>();
        const decimalDigits = new Map<string, string>();

        for (const word of result.words) {
            const sort = simpleParser.lookupSort(word, "ja");
            if (sort?.startsWith("動")) {
                const equivalent = word.equivalentNames["ja"]?.[0];
                if (equivalent?.length == 1) {
                    digits.set(word.name, equivalent);
                } else if (equivalent?.length == 2) {
                    decimalDigits.set(word.name, equivalent[1]);
                }
            }

            this.dictionary.deleteWord(word.uid);
        }

        return [digits, decimalDigits];
    }
}
