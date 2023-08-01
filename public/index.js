let pool = [];

document.querySelector('[autofocus]').focus();

document.getElementById('usernameField').addEventListener('keyup', function (e) {
    if (e.key === 'Enter') {
        document.getElementById('submitButton').click();
    }
});

document.getElementById('searchOptionsButton').addEventListener('click', function () {
    let searchOptions = document.getElementById('searchOptions');
    if (searchOptions.hidden) {
        searchOptions.hidden = false;
        this.classList.add("active");
    } else {
        searchOptions.hidden = true;
        this.classList.remove("active");
    }
});

document.getElementById('submitButton').addEventListener('click', async function () {
    let usernameField = document.getElementById('usernameField');
    let username = usernameField.value;
    let isNSFW = document.getElementById('nsfwCheckbox').checked;
    let timeout = document.getElementById('timeoutField').value;
    let sites = await loadSites(isNSFW, "https://raw.githubusercontent.com/sherlock-project/sherlock-data/master/data.json");
    let progressBar = document.getElementById("progressSpan");
    let resultsDiv = document.getElementById("resultsDiv");
    let resultsContainer = document.getElementById("resultsContainer");
    resultsDiv.innerHTML = "";
    resultsDiv.hidden = false;
    resultsContainer.hidden = false;
    if (username) {
        let search = new Search(sites, username, timeout);
        progressBar.hidden = false;
        progressBar.scrollIntoView();
        changeButtons();
        await search.perform();
    } else {
        usernameField.classList.add("flashRed");
        setTimeout(() => {
            usernameField.classList.remove("flashRed");
        }, 1000);
    }
});

document.getElementById('stopButton').addEventListener('click', async function () {
   for(let request of pool) {
       request.abort();
   }
});

function changeButtons() {
    let searchButton = document.getElementById("submitButton");
    let stopButton = document.getElementById("stopButton");

    if(searchButton.style.display === "none") {
        searchButton.style.display = "block";
        stopButton.style.display = "none";
    } else {
        searchButton.style.display = "none";
        stopButton.style.display = "block";
    }
}

class Search {
    constructor(sites, query, timeout) {
        this.sites = sites;
        this.query = query;
        this.timeout = timeout;
        this.progress = new Progress(0, 0, sites.length, () => {
            changeButtons();
        });
        this.resultDiv = document.getElementById("resultsDiv");
    }

    async perform() {
        let results = [];
        for (let site of this.sites) {
            site.search(this.query, this.timeout).then((result) => {
                if (result) {
                    results.push(site);
                    this.progress.addSuccess();
                    this.display(site);
                } else {
                    this.progress.addFail();
                }
            });
        }
        return results;
    }

    display(site) {
        let resultSpan = document.createElement("span");
        resultSpan.classList.add("resultSpan");

        let result = document.createElement("span");
        result.classList.add("result");
        result.innerText = site.name;
        result.href = site.url.replace("{}", this.query);

        resultSpan.addEventListener("click", (e) => {
            e.preventDefault();
            open(result.href, "_blank");
        });

        let icon = document.createElement("img");
        icon.src = site.mainUrl + (site.mainUrl.endsWith("/") ? "" : "/") + "favicon.ico";
        icon.alt = site.name;
        icon.classList.add("icon");

        resultSpan.appendChild(icon);
        resultSpan.appendChild(result);

        // Insert the element in the correct alphabetical position
        let children = this.resultDiv.children;
        let i = 0;
        for(; i < children.length; i++) {
            if(children[i].children[1].innerText > site.name) {
                break;
            }
        }
        this.resultDiv.insertBefore(resultSpan, children[i]);
    }
}

class Site {

    constructor(name, url, mainUrl, errorType, errorCode, requestMethod, errorMsg, errorUrl, regexCheck, urlProbe, isNSFW, headers, request_payload) {
        this.name = name;
        this.url = url;
        this.mainUrl = mainUrl;
        this.errorType = errorType;
        this.errorCode = errorCode;
        this.requestMethod = requestMethod;
        this.errorMsg = errorMsg;
        this.errorUrl = errorUrl;
        this.regexCheck = regexCheck;
        this.urlProbe = urlProbe;
        this.isNSFW = isNSFW;
        this.headers = headers;
        this.request_payload = request_payload;
    }

    async search(query, timeoutTime) {

        if(this.regexCheck) {
            let regex = new RegExp(this.regexCheck);
            if(!regex.test(query)) return false;
        }

        if(this.request_payload) {
            for(let key in this.request_payload) {
                this.request_payload[key] = this.request_payload[key].replace("{}", query);
            }
        }

        let url;
        if(this.urlProbe) {
            url = this.urlProbe.replace("{}", query);
        } else {
            url = this.url.replace("{}", query);
        }

        let signal = new AbortController();
        pool.push(signal);
        setTimeout(() => signal.abort(), timeoutTime * 1000);

        let response = await fetch(url, {
            method: this.requestMethod || "GET",
            headers: this.headers || {},
            redirect: "follow",
            signal: signal.signal,
            body: this.requestMethod === "POST" ? JSON.stringify(this.request_payload) : undefined
        }).catch(() => {
            return false;
        });

        pool.splice(pool.indexOf(signal), 1);

        if(!response) return false;

        if(this.errorType === "status_code") {
            if(response.status === this.errorCode || response.status !== 200) {
                return false;
            }
        }

        if (this.errorType === "response_url") {
            if (response.url === this.errorUrl.replace("{}", query)) {
                return false;
            }
        }

        if (this.errorType === "message") {
            let text = await response.text();
            if (text.includes(this.errorMsg)) {
                return false;
            }
        }

        return true;
    }
}

class Progress {
    constructor(success, fail, total, onComplete) {
        this.success = success;
        this.fail = fail;
        this.total = total;

        this.onComplete = onComplete;
        this.bar = document.getElementById("searchProgress");
        this.bar.max = total;
        this.successText = document.getElementById("successText");
        this.failText = document.getElementById("failText");
        this.totalText = document.getElementById("totalText");
    }

    addSuccess() {
        this.success++;
        this.update();
    }

    addFail() {
        this.fail++;
        this.update();
    }

    update() {
        this.successText.innerText = this.success;
        this.failText.innerText = this.fail;
        this.totalText.innerText = this.total;
        this.bar.value = this.fail + this.success;

        if(this.fail + this.success === this.total) {
            this.onComplete();
        }
    }
}

function loadSites(isNSFW, path = "sites.json") {
    return fetch(path)
        .then((response) => response.json())
        .then((json) => {
            let sites = [];
            for (let site in json) {
                let siteName = site;
                site = json[siteName];
                if (site.isNSFW && !isNSFW) continue;
                sites.push(new Site(siteName, site.url, site.urlMain, site.errorType, site.errorCode, site.requestMethod, site.errorMsg, site.errorUrl, site.regexCheck, site.urlProbe, site.isNSFW, site.headers, site.request_payload));
            }
            return sites;
        });
}