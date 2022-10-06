function sanitizeHTML(str) {
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

/**
 * Renders code and change "Run" button state.
 * @param {object} editor DOM element
 */
function updateEditor(editor) {
  // Split textareas value
  const lines = sanitizeHTML(editor.querySelector("[data-http-parser-textarea]").value).split("\n");

  // Indicates if HTTP header is finished
  let bodyStarted = false;

  let readyForExecute = false;

  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      const elements = lines[i].split(" ");

      // First elements defines the method
      const method = elements[0].toLowerCase();
      if (
        method === "get" ||
        method === "head" ||
        method === "post" ||
        method === "put" ||
        method === "delete" ||
        method === "connect" ||
        method === "options" ||
        method === "trace" ||
        method === "patch"
      ) {
        elements[0] = `<span class="http-method">${elements[0]}</span>`;
      } else {
        // If the first element of the first line is not a valid method, the rest of the input shouldn't be parsed.
        break;
      }

      if (elements.length > 1 && elements[1].trim()) {
        // Get URL
        elements[1] = `<span class="http-path">${elements[1]}</span>`;

        // Get HTTP version
        if (elements.length === 3 && elements[2] === "HTTP/1.1") {
          elements[2] =
            '<span class="http-version-prefix">HTTP</span><span class="http-version-slash">/</span><span class="http-version-number">1.1</span> ';
          readyForExecute = true;
        }
      }

      // Rebuild line
      lines[0] = elements.join(" ");
    } else if (readyForExecute && !bodyStarted) {
      if (!lines[i].trim()) {
        // Empty line: Start parsing body in the next line(s)
        bodyStarted = true;
        readyForExecute = true;
      } else {
        // Parse header
        const elements = lines[i].split(":");
        if (!elements[0].trim() || elements.length === 1) {
          readyForExecute = false;
          break;
        }
        elements[0] = `<span class="http-header-key">${elements[0]}</span>`;
        elements[1] = `<span class="http-header-value">${elements[1]}`;
        elements[elements.length - 1] = `${elements[elements.length - 1]}</span>`;
        lines[i] = elements.join(":");
      }
    } else if (bodyStarted) {
      lines[i] = '<span class="http-body">' + lines[i];
      lines[lines.length - 1] = lines[lines.length - 1] + "</span>";
      break;
    }
  }

  // Show rendered code
  editor.querySelector("[data-http-parser-rendered]").innerHTML = lines.join("\n") + "\n";

  // Change state of "Run" button based on correct syntax and minimum information
  try {
    getRequest(editor); // throws if informations are missing
    editor.querySelector("[data-http-parser-run]").disabled = !readyForExecute;
  } catch (e) {
    editor.querySelector("[data-http-parser-run]").disabled = true;
  }
}

/**
 * Specific wrapper for Fetch API
 * @param {string} url
 * @param {string} method
 * @param {object} headers
 * @param {string} body
 * @returns fully formated response string
 */
async function sendRequest(url, method, headers, body) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : null,
    });

    const responseBody =
      response.headers.get("content-type") === "application/json"
        ? JSON.stringify(await response.json(), null, 2)
        : await response.text();

    const headerResponse = [...response.headers]
      .map((e) => e.join(": "))
      .join("\n")
      .replace("content-type:", "Content-Type:")
      .replace("last-modified:", "Last-Modified:");

    return `HTTP/1.1 ${response.status} ${response.statusText}\n${headerResponse}\n\n${responseBody}`.trim();
  } catch (e) {
    return e.toString();
  }
}

/**
 * Parses request code based on the syntax/highlight classes.
 * @param {object} editor DOM element
 * @returns parsed http request object
 */
function getRequest(editor) {
  const httpMethod = editor.querySelector(".http-method").innerText.trim();
  const httpPath = editor.querySelector(".http-path").innerText.trim();
  if (!httpPath.startsWith("/")) throw new Error("Path should begin with /");
  const httpVersion = editor.querySelector(".http-version-number").innerText.trim();
  if (httpVersion !== "1.1") throw new Error("HTTP version not supported");
  const httpHeaderKeys = Array.from(editor.querySelectorAll(".http-header-key")).map((e) => e.innerText.trim());
  const httpHeaderValues = Array.from(editor.querySelectorAll(".http-header-value")).map((e) => e.innerText.trim());
  const bodyElement = editor.querySelector(".http-body");
  const httpBody = bodyElement ? editor.querySelector(".http-body").innerText : null;
  const hostHeaderIndex = httpHeaderKeys.findIndex((e) => e.toLowerCase() === "host");
  const host = httpHeaderValues[hostHeaderIndex].trim();
  const httpHeaderKeysWithoutHost = httpHeaderKeys.filter((e, i) => i !== hostHeaderIndex);
  const httpHeaderValuesWithoutHost = httpHeaderValues.filter((e, i) => i !== hostHeaderIndex);
  const headers = httpHeaderKeysWithoutHost.reduce((accumulator, element, index) => {
    return { ...accumulator, [element]: httpHeaderValuesWithoutHost[index] };
  }, {});
  return {
    httpMethod,
    httpUrl: "https://" + host + httpPath,
    headers,
    httpBody,
  };
}

/**
 * Gets editor's code, runs a HTTP request and shows the response.
 * @param {object} editor DOM element
 */
async function run(editor) {
  // Get and parse code
  const request = getRequest(editor);

  // Show "waiting" message
  const responseWrapperElement = editor.querySelector(".http-parser-response-wrapper");
  responseWrapperElement.style.display = "block";
  const responsePreElement = editor.querySelector(".http-parser-response-wrapper pre");
  responsePreElement.innerText = "Waiting...";
  const timer = setInterval(() => {
    responsePreElement.innerText = responsePreElement.innerText + ".";
  }, 1000);

  // Send request
  const response = await sendRequest(request.httpUrl, request.httpMethod, request.headers, request.httpBody);

  // Clear animated waiting text timer if response is received
  clearInterval(timer);

  // Show response
  responsePreElement.innerText = response;
}

/**
 * Resets editor's code to inital value and hides response element.
 * @param {object} editor DOM element
 * @param {number} index Number of editor on the page
 */
function reset(editor, index) {
  editor.querySelector("[data-http-parser-textarea]").value = initialCodes[index];
  updateEditor(editor);
  editor.querySelector(".http-parser-response-wrapper").style.display = "none";
}

// Get all editors
const editors = Array.from(document.querySelectorAll("[data-http-parser]"));

// Storage for inital codes (because of the reset function)
const initialCodes = [];

// Same random path prefix for all editors
const reviewId = "review" + Math.floor(Math.random() * 999999);

// Initialize editors
editors.forEach((editor, index) => {
  // Change path prefix in inital code and update UI
  const textarea = editor.querySelector("[data-http-parser-textarea]");
  const initialCode = textarea.value.replace("review123456", reviewId);
  textarea.value = initialCode;
  initialCodes.push(initialCode);
  updateEditor(editor);

  // Add editor index for the reset function
  editor.querySelector("[data-http-parser-reset]").dataset.httpParserReset = index;
});

// Register event listener
document.addEventListener("input", (e) => {
  if (e.target.dataset.hasOwnProperty("httpParserTextarea")) {
    return updateEditor(e.target.closest("[data-http-parser]"));
  }
});
document.addEventListener("click", (e) => {
  if (e.target.dataset.hasOwnProperty("httpParserRun")) {
    return run(e.target.closest("[data-http-parser]"));
  }
  if (e.target.dataset.hasOwnProperty("httpParserReset")) {
    return reset(e.target.closest("[data-http-parser]"), Number(e.target.dataset.httpParserReset));
  }
});
