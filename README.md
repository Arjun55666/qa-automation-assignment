# Kuber.AI Deep Think Mode Automation

Android UI automation for the question-and-answer flow in Simplify Money's Kuber.AI Deep Think Mode.

## Tech Stack

- JavaScript
- Node.js
- WebdriverIO
- Appium
- UiAutomator2
- Android SDK

## What the Script Tests

The script automates the following steps:

1. Connects to the Simplify Money Android application.
2. Checks whether the Deep Think control is visible.
3. Enters and submits a test question.
4. Monitors the screen for a response, coin-confirmation prompt, daily-limit message, or application error.
5. Checks whether the detected response remains stable across consecutive polls.
6. Saves the captured UI hierarchy and a JSON test report.

## Test Question

Default question:

`How much do I need to spend to buy Golden Goose sneakers?`

To use a different question, set the `TEST_QUESTION` environment variable before running the script.

## Project Structure

```text
simplify-money-qa-automation/
├── deep-think-test.js
├── package.json
├── package-lock.json
└── README.md
```

## Prerequisites

- Node.js and npm
- Android device with USB debugging enabled and authorized
- Android SDK and platform tools
- Appium with the UiAutomator2 driver installed
- Project dependencies installed

## Setup

Install the project dependencies:

```bash
npm install
```

Make sure the Android device is connected and authorized. The device identifier configured in the script must match the connected device.

## Execution

Start Appium in the first PowerShell terminal:

```powershell
cd "$HOME\simplify-money-qa"
$env:ANDROID_HOME = "$HOME\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npx appium
```

Open a second PowerShell terminal and run:

```powershell
cd "$HOME\simplify-money-qa"
node deep-think-test.js
```

Check JavaScript syntax without running the test:

```powershell
node --check .\deep-think-test.js
```

## Custom Question

To run the test with a different question in PowerShell:

```powershell
$env:TEST_QUESTION = "Enter your test question here"
node deep-think-test.js
```

## Recorded Test Result

The saved report from the recorded run shows **PASS** for the response-stability check.

- Response length: 616 characters
- Recorded elapsed time: 338,144 ms (approximately 5 minutes 38 seconds)
- Result condition: the detected response text remained stable across consecutive checks

The PASS status does not verify the factual accuracy of the generated answer. Execution time and response content may vary between runs.

## Coin-Confirmation Handling

If a coin-confirmation prompt appears, the script pauses for a human decision rather than automatically approving the continuation.

## Output Files

- `deep-think-result.xml` — captured UI hierarchy.
- `deep-think-report.json` — test status, response text, response length, elapsed time, and other execution details.

## Limitations

- Response stability is a heuristic and does not establish factual correctness.
- The script relies on the application's UI accessibility hierarchy and may require locator updates if the interface changes.
- Coin-confirmation prompts require human review.
- The recorded execution time may vary between runs.

