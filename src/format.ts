import {
    MarkupResolver,
    MarkupParser,
    Parser
} from "soxsot";
import type { Token } from "./split.ts";
import type { Word } from "./search.ts";

interface HtmlString {
    html: string;
}

function escape(text: string | HtmlString): string {
    if (typeof text == "string") {
        return text
            .replace(/&/gu, "&amp;")
            .replace(/</gu, "&lt;")
            .replace(/>/gu, "&gt;");
    } else {
        return text.html;
    }
}

function h(template: TemplateStringsArray, ...args: (string | HtmlString)[]): string {
    let html = template[0];
    for (let i = 1; i < template.length; i++) {
        html += escape(args[i - 1]);
        html += template[i];
    }
    return html;
}

const markupResolver = new MarkupResolver<HtmlString, HtmlString>({
    resolveLink: (name, children) => ({ html: children.map(escape).join("") }),
    resolveBracket: (children) => ({ html: children.map(escape).join("") }),
    resolveSlash: (string) => ({ html: `<span class="italic">${escape(string)}</span>` }),
    join: (nodes) => ({ html: nodes.map(escape).join("") })
});
const markupParser = new MarkupParser(markupResolver);
const parser = new Parser(markupResolver);

export function formatWordResult(token: Token, words: Word[], ignoreDiacritic: boolean): HTMLElement {
    let html = h`<div class="resultHeader">`;
    html += h`<div class="inputName">${token.input}</div>`;

    const searchWord = token.name.toLowerCase().replace(/^ʻ/, "");
    const searchUrl = `https://dic.ziphil.com/?ignoreDiacritic=${ignoreDiacritic.toString()}&mode=name&search=${encodeURIComponent(searchWord)}&type=exact&page=0`;
    html += h`<div class="action"><a href="${searchUrl}" target="_blank" rel="noopener">辞典</a></div>`

    html += h`</div>`;

    for (const word of words) {
        const formattedWord = formatWord(word);
        if (formattedWord == null) {
            continue;
        }

        const isCompact = formattedWord.name.length <= 2 &&
            formattedWord.inflectionTags.length == 0 &&
            formattedWord.equivalents.length == 1 &&
            !formattedWord.equivalents[0].generated;

        html += h`<div class="word ${isCompact ? "compact" : ""}">`;

        html += h`<div class="wordHeader">`;
        html += h`<span class="name">${formattedWord.name}</span>`;
        if (formattedWord.inflectionTags.length != 0) {
            html += h`<span class="small"> (${formattedWord.inflectionTags.join(" ")})</span>`;
        }
        html += h`</div>`;

        for (const equivalent of formattedWord.equivalents) {
            html += h`<div class="equivalent ${equivalent.weak ? "weak" : ""} ${equivalent.generated ? "generated" : ""} ">`;

            if (equivalent.category != null) {
                html += h`<span class="tag">${equivalent.category}</span>`;
            }

            if (equivalent.frame != null) {
                html += h`<span class="small">(${equivalent.frame})</span> `;
            }

            html += h`${equivalent.names}`;
            html += `</div>`;
        }

        html += h`</div>`;
    }

    const wordElement = document.createElement("div");
    wordElement.classList.add("wordResult");
    if (words.length == 0) {
        wordElement.classList.add("notFound");
    }
    wordElement.innerHTML = html;
    return wordElement;
}

const VERBAL_GENERATED_EQUIVALENT: Record<string, string | undefined> = {
    "動": "――になる, ――にする",
    "形": "――している, ――された, ――な",
    "副": "――に, ――して, ――しながら",
    "名": "――すること",
};

const NOMINAL_GENERATED_EQUIVALENT: Record<string, string | undefined> = {
    "形": "――を想起させるような",
};

interface FormattedEquivalent {
    category: string | null;
    frame: HtmlString | null;
    names: HtmlString;
    weak: boolean;
    generated: boolean;
}

interface FormattedWord {
    name: string;
    inflectionTags: string[];
    equivalents: FormattedEquivalent[];
}

function formatWord(word: Word): FormattedWord | null {
    if (word.type == "dictionary") {
        const parsedWord = parser.parse(word.word);
        const section = parsedWord.parts["ja"]?.sections[0];
        if (section == undefined) {
            return null;
        }

        const equivalents: FormattedEquivalent[] = [];
        const expectedCategory = word.category;
        let hasMatchCategory = false;
        for (const equivalent of section.getEquivalents(true)) {
            const matchCategory = expectedCategory == undefined ||
                (equivalent.category?.startsWith(expectedCategory) == true);
            hasMatchCategory ||= matchCategory;

            equivalents.push({
                category: equivalent.category,
                frame: equivalent.frame,
                names: { html: equivalent.names.map(x => x.html).join(", ") },
                weak: !matchCategory,
                generated: false
            });
        }

        if (!hasMatchCategory) {
            const equivalentNames =
                section.sort?.startsWith("動") == true ? VERBAL_GENERATED_EQUIVALENT[expectedCategory!] :
                section.sort?.startsWith("名") == true ? NOMINAL_GENERATED_EQUIVALENT[expectedCategory!] :
                undefined
            equivalents.push({
                category: expectedCategory!,
                frame: null,
                names: markupParser.parse(equivalentNames ?? "?"),
                weak: false,
                generated: true
            });
        }

        return {
            name: parsedWord.name,
            inflectionTags: word.inflectionTags ?? [],
            equivalents
        };
    } else {
        const equivalents = word.equivalents.map(equivalent => ({
            category: equivalent.category,
            frame: equivalent.frame == null ? null : markupParser.parse(equivalent.frame),
            names: markupParser.parse(equivalent.names ?? "?"),
            weak: false,
            generated: word.notShowAsGenerated != true
        }));
        return {
            name: word.name,
            inflectionTags: [],
            equivalents
        };
    }
}
