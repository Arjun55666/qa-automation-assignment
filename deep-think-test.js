
const { remote } = require('webdriverio');
const fs = require('fs');
const readline = require('readline');

const QUESTION =
  process.env.TEST_QUESTION ||
  'How much do I need to spend to buy Golden Goose sneakers?';

const TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 2000;
const STABLE_CHECKS_REQUIRED = 4;

const PLACEHOLDER_TEXT =
  'How can I help you with your finances today?';

function decodeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#(\d+);/g, (_, code) => {
      const number = Number(code);
      return number <= 0x10ffff
        ? String.fromCodePoint(number)
        : '';
    })
    .trim();
}

function extractTextViews(source) {
  const results = [];
  const regex =
    /<android\.widget\.TextView\b[^>]*\btext="([^"]*)"[^>]*\/>/g;

  let match;

  while ((match = regex.exec(source)) !== null) {
    const text = decodeXml(match[1]);
    if (text) results.push(text);
  }

  return results;
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyScreen(texts) {
  const combined = normalize(texts.join(' '));

  if (
    combined.includes('coins will be deducted per query') ||
    (
      combined.includes('coins will be deducted') &&
      combined.includes('continue')
    )
  ) {
    return 'AWAITING_USER_CONFIRMATION';
  }

  if (
    combined.includes("you've reached your daily limit") ||
    combined.includes('you have reached your daily limit') ||
    combined.includes('daily limit reached') ||
    combined.includes('upgrade your plan to continue')
  ) {
    return 'BLOCKED';
  }

  if (
    combined.includes('something went wrong') ||
    combined.includes('failed to generate response') ||
    combined.includes('unable to generate response')
  ) {
    return 'ERROR';
  }

  return 'CHECK_RESPONSE';
}

function askHumanToContinue() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(
      '\nReview the phone. Decide manually whether to tap Continue or cancel. ' +
      'Then press Enter here.\n',
      () => {
        rl.close();
        resolve();
      }
    );
  });
}

async function main() {
  let driver;
  let result = 'FAIL';
  let answer = '';
  let elapsedMs = 0;
  let confirmationSeen = false;
  let confirmationPromptDismissed = false;
  let errorMessage = '';
  let statusReason = '';
  let responseStartTime = null;

  const startedAt = Date.now();

  try {
    driver = await remote({
      hostname: '127.0.0.1',
      port: 4723,
      path: '/',
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Android Phone',
        'appium:udid': '10BD6P1ATT000J4',
        'appium:appPackage': 'com.simplifymoney',
        'appium:appActivity': '.MainActivity',
        'appium:noReset': true,
        'appium:newCommandTimeout': 180
      }
    });

    const deepThink = await driver.$(
      'android=new UiSelector().description("Deep Think")'
    );

    await deepThink.waitForDisplayed({ timeout: 15000 });
    console.log('PASS: Deep Think control is visible.');

    const questionBox = await driver.$(
      'android=new UiSelector().className("android.widget.EditText")'
    );

    await questionBox.waitForDisplayed({ timeout: 15000 });

    const baselineSource = await driver.getPageSource();
    const baselineTexts = new Set(
      extractTextViews(baselineSource).map(normalize)
    );

    await questionBox.setValue(QUESTION);

    const sendButton = await driver.$(
      'android=new UiSelector().resourceId("btn_send_message")'
    );

    await sendButton.waitForDisplayed({ timeout: 10000 });
    await sendButton.click();

    console.log('Question submitted.');
    console.log('Monitoring for confirmation, blockers, or a response...');

    const overallDeadline = Date.now() + TIMEOUT_MS;
    let previousAnswer = '';
    let stableChecks = 0;

    while (Date.now() < overallDeadline) {
      await driver.pause(POLL_INTERVAL_MS);

      const source = await driver.getPageSource();

      fs.writeFileSync(
        'deep-think-result.xml',
        source,
        'utf8'
      );

      const texts = extractTextViews(source);
      const screenStatus = classifyScreen(texts);

      if (screenStatus === 'AWAITING_USER_CONFIRMATION') {
        confirmationSeen = true;
        statusReason = 'Paid continuation requires a human decision.';

        console.log('Coin confirmation detected.');
        console.log('Automation will NOT press Continue.');

        await askHumanToContinue();

        confirmationPromptDismissed = true;
        responseStartTime = Date.now();
        previousAnswer = '';
        stableChecks = 0;
        result = 'FAIL';

        continue;
      }

      if (screenStatus === 'BLOCKED') {
        result = 'BLOCKED';
        statusReason =
          'Daily limit or upgrade message detected; no successful response verified.';
        errorMessage = statusReason;

        console.log('BLOCKED:', statusReason);
        break;
      }

      if (screenStatus === 'ERROR') {
        result = 'FAIL';
        statusReason = 'An app response error was detected.';
        errorMessage = statusReason;

        console.log('FAIL:', statusReason);
        break;
      }

      // The XML showed answer text in a ViewGroup content-desc attribute.
      // Read those descriptions rather than relying only on TextView children.
      const descriptionElements = await driver.$$(
        '//android.view.ViewGroup[@content-desc]'
      );

      let answerCandidate = '';

      for (const element of descriptionElements) {
        const description = (
          await element.getAttribute('content-desc')
        )?.trim() || '';

        const value = normalize(description);

        if (
          description.length >= 30 &&
          !baselineTexts.has(value) &&
          value !== normalize(QUESTION) &&
          value !== normalize(PLACEHOLDER_TEXT) &&
          !value.includes('your info is secure and private') &&
          !value.includes('coins will be deducted') &&
          !value.includes('upgrade your plan to continue') &&
          !value.includes('you have reached your daily limit') &&
          !value.includes("you've reached your daily limit") &&
          !/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(description)
        ) {
          if (description.length > answerCandidate.length) {
            answerCandidate = description;
          }
        }
      }

      if (!answerCandidate || answerCandidate.length < 30) {
        continue;
      }

      if (answerCandidate === previousAnswer) {
        stableChecks++;
      } else {
        previousAnswer = answerCandidate;
        stableChecks = 0;
      }

      console.log(
        `Response detected; stable checks: ` +
        `${stableChecks}/${STABLE_CHECKS_REQUIRED}`
      );

      if (stableChecks >= STABLE_CHECKS_REQUIRED) {
        answer = answerCandidate;
        result = 'PASS';
        statusReason =
          'Answer content-description text remained stable. ' +
          'Factual accuracy was not evaluated.';

        elapsedMs = Date.now() - (responseStartTime || startedAt);
        break;
      }
    }

    if (result === 'FAIL' && !errorMessage) {
      errorMessage = 'No stable response detected before timeout.';
      statusReason = errorMessage;
      console.error('FAIL:', errorMessage);
    } else if (result === 'PASS') {
      console.log('PASS: Answer text remained stable.');
      console.log(`Elapsed time: ${elapsedMs} ms`);
      console.log(`Response length: ${answer.length} characters`);
      console.log(`Response preview: ${answer.slice(0, 200)}`);
    }
  } catch (error) {
    result = 'FAIL';
    errorMessage = error.message;
    statusReason = 'Automation encountered an exception.';

    console.error('FAIL:', errorMessage);
  } finally {
    const report = {
      question: QUESTION,
      mode: 'Deep Think',
      result,
      statusReason,
      confirmationSeen,
      confirmationPromptDismissed,
      responseText: answer,
      responseLength: answer.length,
      elapsedMs,
      error: errorMessage || null,
      checkedAt: new Date().toISOString(),
      note:
        'Response stability is a heuristic. Factual accuracy is not verified. ' +
        'The script reads accessibility content descriptions and may require ' +
        'adjustment if the app UI hierarchy changes. Dismissing the manual ' +
        'prompt does not prove Continue was tapped.'
    };

    fs.writeFileSync(
      'deep-think-report.json',
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log(`Final status: ${result}`);
    console.log('Report saved to deep-think-report.json');

    if (driver) {
      try {
        await driver.deleteSession();
      } catch (cleanupError) {
        console.error(
          'Warning: Could not cleanly close Appium session:',
          cleanupError.message
        );
      }
    }

    if (result !== 'PASS') {
      process.exitCode = 1;
    }
  }
}

main().catch(error => {
  console.error('Test failed:', error.message);
  process.exitCode = 1;
});
