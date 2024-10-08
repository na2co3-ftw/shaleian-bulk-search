import localForage from "localforage";
import type { PlainDictionary } from "soxsot";
import { Dictionary } from "./dictionary.ts";
import { splitToTokens } from "./split.ts";
import { searchAndGenerateWords } from "./search.ts";
import { formatWordResult } from "./format.ts";
import "./style.css";

async function main() {
    let dictionary: Dictionary | null = null;

    const input = document.getElementById("input") as HTMLInputElement;
    const clearInput = document.getElementById("clearInput") as HTMLButtonElement;
    const ignoreDiacritic = document.getElementById("ignoreDiacritic") as HTMLInputElement;
    const wordList = document.getElementById("resultList")!;
    const downloadButton = document.getElementById("downloadDictionary") as HTMLButtonElement;
    const dictionaryStatus = document.getElementById("dictionaryStatus")!;

    const params = new URLSearchParams(location.search);
    input.value = params.get("input") ?? "";
    clearInput.classList.toggle("hidden", input.value == "");
    ignoreDiacritic.checked = params.get("ignoreDiacritic") == "true";

    let timeout: number | null = null;
    input.addEventListener("input", function () {
        clearInput.classList.toggle("hidden", input.value == "");
        startSearch();
    });
    clearInput.addEventListener("click", function () {
        input.value = "";
        clearInput.classList.add("hidden");
        input.focus();
        startSearch();
    });
    ignoreDiacritic.addEventListener("change", function () {
        startSearch();
    });
    function startSearch() {
        if (timeout != null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(function () {
            timeout = null;

            const params = new URLSearchParams();
            params.set("input", input.value);
            params.set("ignoreDiacritic", ignoreDiacritic.checked.toString());
            history.replaceState(null, "", "?" + params.toString());

            execSearch();
        }, 500);
    }
    function execSearch() {
        if (dictionary != null) {
            search(dictionary, input.value, ignoreDiacritic.checked, wordList);
        }
    }

    downloadButton.addEventListener("click", async function () {
        downloadButton.disabled = true;
        try {
            dictionary = await downloadDictionary();
            updateDictionaryStatus();
            execSearch();
        } catch {}
        downloadButton.disabled = false;
    });
    function updateDictionaryStatus() {
        if (dictionary == null) {
            dictionaryStatus.textContent = "辞書データ: なし";
        } else {
            dictionaryStatus.textContent = "辞書更新日: " + dictionary.updatedAt.toLocaleString();
        }
    }

    dictionary = await loadDictionary();
    if (dictionary == null) {
        try {
            dictionary = await downloadDictionary();
        } catch {}
    }
    updateDictionaryStatus();
    execSearch();
    downloadButton.disabled = false;
    input.focus();
}

async function loadDictionary(): Promise<Dictionary | null> {
    const plainDictionary = await localForage.getItem<PlainDictionary>("dictionary");
    if (plainDictionary == null) {
        return null;
    }

    const updatedAt = await localForage.getItem<string>("updatedAt");
    if (updatedAt == null) {
        return null;
    }
    const updatedAtDate = new Date(updatedAt);
    if (updatedAtDate.getTime() < new Date("2024-10-06T00:00:00.000+09:00").getTime()) {
        return null;
    }

    return new Dictionary(plainDictionary, updatedAtDate);
}

async function downloadDictionary(): Promise<Dictionary> {
    const request = await fetch("https://dic.ziphil.com/api/dictionary/fetch");
    const plainDictionary = await request.json() as PlainDictionary;
    const updatedAt = new Date();

    (async () => {
        await localForage.setItem("dictionary", plainDictionary);
        await localForage.setItem("updatedAt", updatedAt.toISOString());
    })();

    return new Dictionary(plainDictionary, updatedAt);
}

function search(dictionary: Dictionary, sentence: string, ignoreDiacritic: boolean, wordList: HTMLElement) {
    wordList.innerHTML = "";

    const tokens = splitToTokens(dictionary, sentence);
    for (const token of tokens) {
        const words = searchAndGenerateWords(dictionary, token, ignoreDiacritic);
        const element = formatWordResult(token, words, ignoreDiacritic);
        wordList.appendChild(element);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    main();
});
