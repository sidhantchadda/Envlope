const SECOND_PER_HOUR = 3_600;
const SECOND_PER_DAY = 86_400;
const SESSION_LENGTH = 10;
const MODE_STORAGE_KEY = "envelope-color-mode";

const state = {
  activeFilter: "all",
  questionIndex: 0,
  questions: [],
  current: null,
  checked: false,
  questionStartedAt: 0,
  elapsedMs: 0,
  timerId: null,
  sessionResults: [],
  seen: new Set(),
};

const elements = {
  tabs: document.querySelectorAll(".tab"),
  questionView: document.querySelector("#questionView"),
  setSummary: document.querySelector("#setSummary"),
  setSummaryCopy: document.querySelector("#setSummaryCopy"),
  summaryGrid: document.querySelector("#summaryGrid"),
  reviewList: document.querySelector("#reviewList"),
  categoryChip: document.querySelector("#categoryChip"),
  difficultyChip: document.querySelector("#difficultyChip"),
  drillCount: document.querySelector("#drillCount"),
  questionTitle: document.querySelector("#questionTitle"),
  questionCopy: document.querySelector("#questionCopy"),
  factsGrid: document.querySelector("#factsGrid"),
  answerForm: document.querySelector("#answerForm"),
  answerList: document.querySelector("#answerList"),
  scratchPad: document.querySelector("#scratchPad"),
  clearScratch: document.querySelector("#clearScratch"),
  checkButton: document.querySelector("#checkAnswer"),
  nextButton: document.querySelector("#nextQuestion"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  resultBadge: document.querySelector("#resultBadge"),
  resultSummary: document.querySelector("#resultSummary"),
  breakdown: document.querySelector("#breakdown"),
  restartSet: document.querySelector("#restartSet"),
  retrySet: document.querySelector("#retrySet"),
  progressStat: document.querySelector("#progressStat"),
  scoreStat: document.querySelector("#scoreStat"),
  missStat: document.querySelector("#missStat"),
  darkModeToggle: document.querySelector("#darkModeToggle"),
};

const apps = [
  {
    name: "photo sharing app",
    readAction: "feed views",
    writeAction: "photo uploads",
    object: "photo",
    objectSizesMB: [2, 4, 6, 8, 10],
    payloadKB: [40, 80, 120, 200],
  },
  {
    name: "team chat product",
    readAction: "message fetches",
    writeAction: "sent messages",
    object: "message",
    objectSizesMB: [1, 2, 4],
    payloadKB: [2, 5, 10, 20],
  },
  {
    name: "short video feed",
    readAction: "video starts",
    writeAction: "video uploads",
    object: "video",
    objectSizesMB: [25, 50, 80, 120],
    payloadKB: [100, 250, 500],
  },
  {
    name: "delivery marketplace",
    readAction: "menu searches",
    writeAction: "order placements",
    object: "order record",
    objectSizesMB: [1, 2, 3],
    payloadKB: [5, 10, 25, 50],
  },
  {
    name: "collaborative docs app",
    readAction: "document opens",
    writeAction: "edit batches",
    object: "document snapshot",
    objectSizesMB: [1, 2, 5, 10],
    payloadKB: [10, 20, 50, 100],
  },
];

const questionGenerators = [
  { filter: "traffic", create: makeTrafficQuestion },
  { filter: "traffic", create: makeBandwidthQuestion },
  { filter: "traffic", create: makeFanoutQuestion },
  { filter: "storage", create: makeStorageQuestion },
  { filter: "storage", create: makeLogQuestion },
  { filter: "latency", create: makeLatencyQuestion },
  { filter: "capacity", create: makeCacheQuestion },
  { filter: "capacity", create: makeWorkerQuestion },
];

const storageUnits = [
  { label: "KB", fromGB: 1_000_000 },
  { label: "MB", fromGB: 1_000 },
  { label: "GB", fromGB: 1 },
  { label: "TB", fromGB: 0.001 },
  { label: "PB", fromGB: 0.000001 },
];

const dailyCountUnits = [
  { unit: "rows/day", fromBase: 1 },
  { unit: "K rows/day", fromBase: 0.001 },
  { unit: "M rows/day", fromBase: 0.000001 },
  { unit: "B rows/day", fromBase: 0.000000001 },
  { unit: "T rows/day", fromBase: 0.000000000001 },
];

const bandwidthUnits = [
  { unit: "Kbps", fromBase: 1_000 },
  { unit: "Mbps", fromBase: 1 },
  { unit: "Gbps", fromBase: 0.001 },
  { unit: "Tbps", fromBase: 0.000001 },
];

function makeTrafficQuestion() {
  const app = pick(apps);
  const dailyUsers = pick([100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000]);
  const actionsPerUser = pick([3, 5, 8, 10, 12, 20, 30, 50]);
  const peakFactor = pick([2, 3, 4, 5]);
  const averageRps = dailyUsers * actionsPerUser / SECOND_PER_DAY;
  const peakRps = averageRps * peakFactor;

  return {
    category: "Traffic",
    difficulty: "Warmup",
    title: "Turn daily usage into RPS",
    copy: `A ${app.name} has ${formatCompact(dailyUsers)} daily users. Each user makes ${actionsPerUser} ${app.readAction} per day. Estimate average and peak request rate.`,
    facts: [
      fact("Daily users", formatCompact(dailyUsers)),
      fact("Actions/user/day", actionsPerUser),
      fact("Peak factor", `${peakFactor}x`),
    ],
    answers: [
      answer("average-rps", "Average request rate", "RPS", whole(averageRps), `${formatWhole(dailyUsers)} users x ${actionsPerUser} actions / 86,400 sec`, {
        steps: [
          `Daily requests = ${formatWhole(dailyUsers)} users x ${actionsPerUser} actions/user/day = ${formatWhole(dailyUsers * actionsPerUser)} requests/day.`,
          `Average RPS = ${formatWhole(dailyUsers * actionsPerUser)} requests/day / 86,400 sec/day = ${formatEstimate(averageRps)} RPS.`,
        ],
      }),
      answer("peak-rps", "Peak request rate", "RPS", whole(peakRps), `${formatWhole(whole(averageRps))} average RPS x ${peakFactor}`, {
        steps: [
          `Start with average RPS: ${formatEstimate(averageRps)}.`,
          `Peak RPS = ${formatEstimate(averageRps)} x ${peakFactor} peak factor = ${formatEstimate(peakRps)} RPS.`,
        ],
      }),
    ],
  };
}

function makeStorageQuestion() {
  const app = pick(apps);
  const dailyUsers = pick([1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000]);
  const uploaderPercent = pick([1, 2, 5, 10, 20]);
  const uploadsPerUploader = pick([1, 2, 3, 5, 8]);
  const sizeMB = pick(app.objectSizesMB);
  const objectsPerDay = dailyUsers * uploaderPercent / 100 * uploadsPerUploader;
  const gbPerDay = objectsPerDay * sizeMB / 1_000;
  const gbPerMonth = gbPerDay * 30;
  const dailyStorage = storageAnswerFromGB(gbPerDay, "/day");
  const monthlyStorage = storageAnswerFromGB(gbPerMonth, "/month");

  return {
    category: "Storage",
    difficulty: "Warmup",
    title: "Estimate new storage",
    copy: `A ${app.name} lets a slice of users create ${app.object}s every day. Estimate raw storage before compression or replication.`,
    facts: [
      fact("Daily users", formatCompact(dailyUsers)),
      fact("Creators", `${uploaderPercent}%`),
      fact(`${capitalize(app.object)}s/creator`, uploadsPerUploader),
      fact("Average size", `${sizeMB} MB`),
    ],
    answers: [
      answer("daily-storage", "New storage per day", dailyStorage.unit, dailyStorage.value, `${formatWhole(objectsPerDay)} ${app.object}s/day x ${sizeMB} MB, converted to selected unit`, {
        baseUnit: dailyStorage.baseUnit,
        baseValue: dailyStorage.baseValue,
        unitOptions: dailyStorage.unitOptions,
        steps: [
          `Creators = ${formatWhole(dailyUsers)} users x ${uploaderPercent}% = ${formatWhole(dailyUsers * uploaderPercent / 100)} creators/day.`,
          `${capitalize(app.object)}s/day = ${formatWhole(dailyUsers * uploaderPercent / 100)} creators x ${uploadsPerUploader} = ${formatWhole(objectsPerDay)} ${app.object}s/day.`,
          `Raw storage = ${formatWhole(objectsPerDay)} ${app.object}s/day x ${sizeMB} MB = ${formatWhole(objectsPerDay * sizeMB)} MB/day = ${formatEstimate(gbPerDay)} GB/day.`,
        ],
      }),
      answer("monthly-storage", "New storage per month", monthlyStorage.unit, monthlyStorage.value, `${formatWhole(objectsPerDay)} ${app.object}s/day x ${sizeMB} MB x 30, converted to selected unit`, {
        baseUnit: monthlyStorage.baseUnit,
        baseValue: monthlyStorage.baseValue,
        unitOptions: monthlyStorage.unitOptions,
        steps: [
          `Daily storage = ${formatEstimate(gbPerDay)} GB/day.`,
          `Monthly storage = ${formatEstimate(gbPerDay)} GB/day x 30 days = ${formatEstimate(gbPerMonth)} GB/month.`,
        ],
      }),
    ],
  };
}

function makeBandwidthQuestion() {
  const app = pick(apps);
  const rps = pick([250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]);
  const payloadKB = pick(app.payloadKB);
  const mbPerSecond = rps * payloadKB / 1_000;
  const megabitsPerSecond = mbPerSecond * 8;
  const gbPerDay = mbPerSecond * SECOND_PER_DAY / 1_000;
  const networkThroughput = scaledUnitAnswer(megabitsPerSecond, bandwidthUnits, "Mbps");
  const dailyEgress = storageAnswerFromGB(gbPerDay, "/day");

  return {
    category: "Throughput",
    difficulty: "Warmup",
    title: "Convert payload into bandwidth",
    copy: `A ${app.name} serves a steady stream of responses. Estimate network throughput and daily egress.`,
    facts: [
      fact("Request rate", `${formatWhole(rps)} RPS`),
      fact("Payload", `${payloadKB} KB`),
    ],
    answers: [
      answer("network-throughput", "Network throughput", networkThroughput.unit, networkThroughput.value, `${formatWhole(rps)} RPS x ${payloadKB} KB x 8, converted to selected unit`, {
        baseUnit: networkThroughput.baseUnit,
        baseValue: networkThroughput.baseValue,
        unitOptions: networkThroughput.unitOptions,
        steps: [
          `Payload flow = ${formatWhole(rps)} RPS x ${payloadKB} KB = ${formatEstimate(mbPerSecond)} MB/s.`,
          `Bandwidth = ${formatEstimate(mbPerSecond)} MB/s x 8 bits/byte = ${formatEstimate(megabitsPerSecond)} Mbps.`,
        ],
      }),
      answer("daily-egress", "Daily egress", dailyEgress.unit, dailyEgress.value, `${formatWhole(whole(mbPerSecond))} MB/s x 86,400, converted to selected unit`, {
        baseUnit: dailyEgress.baseUnit,
        baseValue: dailyEgress.baseValue,
        unitOptions: dailyEgress.unitOptions,
        steps: [
          `Payload flow = ${formatWhole(rps)} RPS x ${payloadKB} KB = ${formatEstimate(mbPerSecond)} MB/s.`,
          `Daily egress = ${formatEstimate(mbPerSecond)} MB/s x 86,400 sec/day = ${formatEstimate(gbPerDay)} GB/day.`,
        ],
      }),
    ],
  };
}

function makeLatencyQuestion() {
  let targetMs;
  let serviceCalls;
  let edgeMs;
  let dataMs;
  let queueMs;
  let safetyMs;
  let perServiceMs;

  do {
    targetMs = pick([150, 200, 250, 300, 400, 500, 800]);
    serviceCalls = pick([2, 3, 4, 5]);
    edgeMs = pick([20, 30, 40, 60, 80]);
    dataMs = pick([30, 50, 80, 120, 150]);
    queueMs = pick([0, 10, 20, 30]);
    safetyMs = pick([20, 40, 60]);
    perServiceMs = (targetMs - edgeMs - dataMs - queueMs - safetyMs) / serviceCalls;
  } while (perServiceMs < 10);

  return {
    category: "Latency",
    difficulty: "Interview",
    title: "Split a latency budget",
    copy: `A request fans through ${serviceCalls} internal services. After fixed costs, give each service an equal p95 budget.`,
    facts: [
      fact("Target p95", `${targetMs} ms`),
      fact("Edge/network", `${edgeMs} ms`),
      fact("Data access", `${dataMs} ms`),
      fact("Queueing", `${queueMs} ms`),
      fact("Safety buffer", `${safetyMs} ms`),
      fact("Service calls", serviceCalls),
    ],
    answers: [
      answer("service-budget", "Budget per service", "ms", whole(perServiceMs), `(${targetMs} - ${edgeMs} - ${dataMs} - ${queueMs} - ${safetyMs}) / ${serviceCalls}`, {
        steps: [
          `Fixed latency = ${edgeMs} edge + ${dataMs} data + ${queueMs} queue + ${safetyMs} buffer = ${edgeMs + dataMs + queueMs + safetyMs} ms.`,
          `Budget left for services = ${targetMs} target - ${edgeMs + dataMs + queueMs + safetyMs} fixed = ${targetMs - edgeMs - dataMs - queueMs - safetyMs} ms.`,
          `Per-service budget = ${targetMs - edgeMs - dataMs - queueMs - safetyMs} ms / ${serviceCalls} services = ${formatEstimate(perServiceMs)} ms.`,
        ],
      }),
    ],
  };
}

function makeCacheQuestion() {
  const hotItems = pick([100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000]);
  const itemKB = pick([1, 2, 4, 8, 16, 32, 64, 128]);
  const replicas = pick([1, 2, 3]);
  const overheadPercent = pick([20, 30, 50, 100]);
  const nodeSizeGB = pick([16, 32, 64, 128]);
  const targetUtilization = pick([50, 60, 70]);
  const totalGB = hotItems * itemKB * replicas * (1 + overheadPercent / 100) / 1_000_000;
  const usableNodeGB = nodeSizeGB * targetUtilization / 100;
  const nodeCount = Math.max(1, Math.ceil(totalGB / usableNodeGB));

  return {
    category: "Cache",
    difficulty: "Interview",
    title: "Size a hot cache",
    copy: "A cache stores the hot set in memory with replication and metadata overhead. Estimate total RAM and node count.",
    facts: [
      fact("Hot objects", formatCompact(hotItems)),
      fact("Object size", `${itemKB} KB`),
      fact("Replicas", replicas),
      fact("Overhead", `${overheadPercent}%`),
      fact("Node size", `${nodeSizeGB} GB`),
      fact("Target use", `${targetUtilization}%`),
    ],
    answers: [
      answer("cache-ram", "Total cache memory", "GB", whole(totalGB), `${formatWhole(hotItems)} objects x ${itemKB} KB x ${replicas} replicas x ${100 + overheadPercent}% / 1,000,000`, {
        steps: [
          `Base memory = ${formatWhole(hotItems)} objects x ${itemKB} KB x ${replicas} replicas = ${formatWhole(hotItems * itemKB * replicas)} KB.`,
          `Add overhead = ${formatWhole(hotItems * itemKB * replicas)} KB x ${100 + overheadPercent}% = ${formatWhole(hotItems * itemKB * replicas * (1 + overheadPercent / 100))} KB.`,
          `Convert to GB = ${formatWhole(hotItems * itemKB * replicas * (1 + overheadPercent / 100))} KB / 1,000,000 = ${formatEstimate(totalGB)} GB.`,
        ],
      }),
      answer("cache-nodes", "Cache nodes", "nodes", nodeCount, `${formatWhole(whole(totalGB))} GB / (${nodeSizeGB} GB x ${targetUtilization}%)`, {
        steps: [
          `Total cache memory = ${formatEstimate(totalGB)} GB.`,
          `Usable memory per node = ${nodeSizeGB} GB x ${targetUtilization}% = ${formatEstimate(usableNodeGB)} GB.`,
          `Nodes = ceil(${formatEstimate(totalGB)} GB / ${formatEstimate(usableNodeGB)} GB) = ${nodeCount} nodes.`,
        ],
      }),
    ],
  };
}

function makeWorkerQuestion() {
  const jobsPerDay = pick([100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000]);
  const secondsPerJob = pick([1, 2, 5, 10, 20, 30, 60]);
  const utilization = pick([50, 60, 70, 80]);
  const jobsPerSecond = jobsPerDay / SECOND_PER_DAY;
  const workers = jobsPerSecond * secondsPerJob / (utilization / 100);

  return {
    category: "Capacity",
    difficulty: "Interview",
    title: "Estimate worker pool size",
    copy: "A background system processes daily jobs continuously. Estimate arrival rate and worker count.",
    facts: [
      fact("Jobs/day", formatCompact(jobsPerDay)),
      fact("Work/job", `${secondsPerJob} sec`),
      fact("Target use", `${utilization}%`),
    ],
    answers: [
      answer("job-rate", "Job arrival rate", "jobs/sec", whole(jobsPerSecond), `${formatWhole(jobsPerDay)} jobs / 86,400 sec`, {
        steps: [
          `Jobs arrive continuously across the day.`,
          `Job arrival rate = ${formatWhole(jobsPerDay)} jobs/day / 86,400 sec/day = ${formatEstimate(jobsPerSecond)} jobs/sec.`,
        ],
      }),
      answer("workers", "Workers needed", "workers", whole(workers), `${formatWhole(whole(jobsPerSecond))} jobs/sec x ${secondsPerJob} sec / ${utilization}%`, {
        steps: [
          `Job arrival rate = ${formatEstimate(jobsPerSecond)} jobs/sec.`,
          `Busy workers = ${formatEstimate(jobsPerSecond)} jobs/sec x ${secondsPerJob} sec/job = ${formatEstimate(jobsPerSecond * secondsPerJob)} workers.`,
          `Account for ${utilization}% utilization: ${formatEstimate(jobsPerSecond * secondsPerJob)} / ${utilization}% = ${formatEstimate(workers)} workers.`,
        ],
      }),
    ],
  };
}

function makeFanoutQuestion() {
  const creators = pick([10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]);
  const postsPerCreator = pick([1, 2, 3, 5]);
  const followers = pick([50, 100, 200, 500, 1_000, 2_000]);
  const postsPerDay = creators * postsPerCreator;
  const deliveryRows = postsPerDay * followers;
  const deliveryWritesPerSecond = deliveryRows / SECOND_PER_DAY;
  const deliveryRowsPerDay = scaledUnitAnswer(deliveryRows, dailyCountUnits, "rows/day");

  return {
    category: "Fanout",
    difficulty: "Stretch",
    title: "Estimate feed fanout",
    copy: "A social feed precomputes one inbox row for each follower of every post. A row is a feed record to store; a write is inserting one of those records.",
    facts: [
      fact("Creators", formatCompact(creators)),
      fact("Posts/creator/day", postsPerCreator),
      fact("Avg followers", formatWhole(followers)),
    ],
    answers: [
      answer("delivery-rows", "Inbox rows created", deliveryRowsPerDay.unit, deliveryRowsPerDay.value, `${formatWhole(postsPerDay)} posts/day x ${formatWhole(followers)} follower inbox rows/post, converted to selected unit`, {
        baseUnit: deliveryRowsPerDay.baseUnit,
        baseValue: deliveryRowsPerDay.baseValue,
        unitOptions: deliveryRowsPerDay.unitOptions,
        steps: [
          `Posts/day = ${formatWhole(creators)} creators x ${postsPerCreator} posts/creator/day = ${formatWhole(postsPerDay)} posts/day.`,
          `Inbox rows/day = ${formatWhole(postsPerDay)} posts/day x ${formatWhole(followers)} followers/post = ${formatWhole(deliveryRows)} rows/day.`,
        ],
      }),
      answer("delivery-writes", "Inbox row writes", "writes/sec", whole(deliveryWritesPerSecond), `${formatWhole(deliveryRows)} inbox rows / 86,400 sec`, {
        steps: [
          `Inbox rows/day = ${formatWhole(deliveryRows)}.`,
          `Writes/sec = ${formatWhole(deliveryRows)} rows/day / 86,400 sec/day = ${formatEstimate(deliveryWritesPerSecond)} writes/sec.`,
        ],
      }),
    ],
  };
}

function makeLogQuestion() {
  const rps = pick([1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000]);
  const linesPerRequest = pick([1, 2, 3, 5, 10]);
  const bytesPerLine = pick([100, 200, 500, 1_000, 2_000]);
  const retentionDays = pick([7, 14, 30, 60, 90]);
  const gbPerDay = rps * linesPerRequest * bytesPerLine * SECOND_PER_DAY / 1_000_000_000;
  const gbRetained = gbPerDay * retentionDays;
  const dailyLogs = storageAnswerFromGB(gbPerDay, "/day");
  const retainedLogs = storageAnswerFromGB(gbRetained, "");

  return {
    category: "Logs",
    difficulty: "Interview",
    title: "Size log retention",
    copy: "A service writes structured logs for every request. Estimate daily ingest and retained storage.",
    facts: [
      fact("Request rate", `${formatWhole(rps)} RPS`),
      fact("Lines/request", linesPerRequest),
      fact("Line size", `${bytesPerLine} bytes`),
      fact("Retention", `${retentionDays} days`),
    ],
    answers: [
      answer("daily-logs", "Log ingest", dailyLogs.unit, dailyLogs.value, `${formatWhole(rps)} RPS x ${linesPerRequest} lines x ${bytesPerLine} bytes x 86,400, converted to selected unit`, {
        baseUnit: dailyLogs.baseUnit,
        baseValue: dailyLogs.baseValue,
        unitOptions: dailyLogs.unitOptions,
        steps: [
          `Bytes/sec = ${formatWhole(rps)} RPS x ${linesPerRequest} lines/request x ${bytesPerLine} bytes = ${formatWhole(rps * linesPerRequest * bytesPerLine)} bytes/sec.`,
          `Bytes/day = ${formatWhole(rps * linesPerRequest * bytesPerLine)} bytes/sec x 86,400 sec/day = ${formatWhole(rps * linesPerRequest * bytesPerLine * SECOND_PER_DAY)} bytes/day.`,
          `Convert to GB/day = ${formatWhole(rps * linesPerRequest * bytesPerLine * SECOND_PER_DAY)} / 1,000,000,000 = ${formatEstimate(gbPerDay)} GB/day.`,
        ],
      }),
      answer("retained-logs", "Retained logs", retainedLogs.unit, retainedLogs.value, `${formatWhole(rps)} RPS x ${linesPerRequest} lines x ${bytesPerLine} bytes x 86,400 x ${retentionDays}, converted to selected unit`, {
        baseUnit: retainedLogs.baseUnit,
        baseValue: retainedLogs.baseValue,
        unitOptions: retainedLogs.unitOptions,
        steps: [
          `Daily ingest = ${formatEstimate(gbPerDay)} GB/day.`,
          `Retained storage = ${formatEstimate(gbPerDay)} GB/day x ${retentionDays} days = ${formatEstimate(gbRetained)} GB.`,
        ],
      }),
    ],
  };
}

function startNewSet() {
  stopTimer();
  state.questions = buildQuestionSet();
  state.questionIndex = 0;
  state.current = null;
  state.checked = false;
  state.elapsedMs = 0;
  state.sessionResults = [];
  elements.questionView.hidden = false;
  elements.setSummary.hidden = true;
  renderQuestion();
  renderSessionStats();
}

function buildQuestionSet() {
  const questions = [];
  const localSeen = new Set();
  let guard = 0;

  while (questions.length < SESSION_LENGTH && guard < SESSION_LENGTH * 50) {
    const challenge = nextChallenge();
    const signature = getSignature(challenge);

    if (!localSeen.has(signature)) {
      localSeen.add(signature);
      questions.push(challenge);
    }

    guard += 1;
  }

  while (questions.length < SESSION_LENGTH) {
    questions.push(nextChallenge());
  }

  return questions;
}

function renderQuestion() {
  const challenge = state.questions[state.questionIndex];
  state.current = challenge;
  state.checked = false;
  state.elapsedMs = 0;

  elements.categoryChip.textContent = challenge.category;
  elements.difficultyChip.textContent = challenge.difficulty;
  elements.drillCount.textContent = `Question ${state.questionIndex + 1} of ${SESSION_LENGTH}`;
  elements.questionTitle.textContent = challenge.title;
  elements.questionCopy.textContent = challenge.copy;
  elements.feedbackPanel.hidden = true;
  elements.breakdown.replaceChildren();
  elements.scratchPad.value = "";
  elements.checkButton.disabled = false;
  elements.checkButton.textContent = "Check answer";
  elements.nextButton.disabled = true;
  elements.nextButton.textContent = state.questionIndex === SESSION_LENGTH - 1 ? "See results" : "Next question";

  elements.factsGrid.replaceChildren(
    ...challenge.facts.map((item) => {
      const node = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      node.className = "fact";
      label.textContent = item.label;
      value.textContent = item.value;
      node.append(label, value);
      return node;
    }),
  );

  elements.answerList.replaceChildren(
    ...challenge.answers.map((item) => {
      const row = document.createElement("div");
      const label = document.createElement("label");
      const input = document.createElement("input");
      const unit = createUnitControl(item);

      row.className = "answer-row";
      label.htmlFor = item.id;
      label.textContent = item.label;
      input.id = item.id;
      input.name = item.id;
      input.type = "number";
      input.min = "0";
      input.step = item.unitOptions ? "any" : "1";
      input.required = true;
      input.inputMode = item.unitOptions ? "decimal" : "numeric";
      input.placeholder = "0";

      row.append(label, input, unit);
      return row;
    }),
  );

  const firstInput = elements.answerList.querySelector("input");
  if (firstInput) {
    firstInput.focus({ preventScroll: true });
  }

  startTimer();
  renderSessionStats();
}

function nextChallenge() {
  const pool = questionGenerators.filter((item) => state.activeFilter === "all" || item.filter === state.activeFilter);
  let challenge = pick(pool).create();
  let signature = getSignature(challenge);
  let guard = 0;

  while (state.seen.has(signature) && guard < 20) {
    challenge = pick(pool).create();
    signature = getSignature(challenge);
    guard += 1;
  }

  state.seen.add(signature);
  if (state.seen.size > 500) {
    state.seen.clear();
  }

  return challenge;
}

function handleSubmit(event) {
  event.preventDefault();

  if (state.checked) {
    handleNextQuestion();
    return;
  }

  if (!elements.answerForm.reportValidity()) {
    return;
  }

  const elapsedMs = stopTimer();
  const results = state.current.answers.map((item) => {
    const input = elements.answerForm.elements[item.id];
    const selectedUnit = getSelectedUnit(item);
    const guess = Number(input.value);
    const expectedValue = selectedUnit ? selectedUnit.value : item.value;
    const gradeInBaseUnit = selectedUnit?.toBase && Number.isFinite(item.baseValue);
    const guessForGrade = gradeInBaseUnit ? guess * selectedUnit.toBase : guess;
    const expectedForGrade = gradeInBaseUnit ? item.baseValue : expectedValue;
    const unit = selectedUnit ? selectedUnit.unit : item.unit;
    return {
      ...item,
      guess,
      unit,
      value: expectedValue,
      formula: item.unitOptions ? item.formula.replace("selected unit", unit) : item.formula,
      solutionSteps: getSolutionSteps(item, selectedUnit, expectedValue, unit),
      grade: gradeAnswer(guessForGrade, expectedForGrade),
    };
  });

  const overall = getOverallGrade(results);
  renderFeedback(overall, results);

  if (!state.checked) {
    state.sessionResults.push({
      question: state.current,
      questionNumber: state.questionIndex + 1,
      overall,
      results,
      elapsedMs,
    });
    state.checked = true;
  }

  elements.answerList.querySelectorAll("input, select").forEach((control) => {
    control.disabled = true;
  });
  elements.checkButton.disabled = true;
  elements.checkButton.textContent = "Checked";
  elements.nextButton.disabled = false;
  elements.nextButton.focus({ preventScroll: true });
  renderSessionStats();
}

function handleNextQuestion() {
  if (!state.checked) {
    return;
  }

  if (state.questionIndex >= SESSION_LENGTH - 1) {
    renderSetSummary();
    return;
  }

  state.questionIndex += 1;
  renderQuestion();
}

function handleKeyboardAdvance(event) {
  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (elements.questionView.hidden || event.target.closest("textarea")) {
    return;
  }

  if (state.checked) {
    event.preventDefault();
    handleNextQuestion();
    return;
  }

  if (elements.answerForm.contains(event.target) && event.target.matches("input")) {
    event.preventDefault();
    elements.answerForm.requestSubmit();
  }
}

function renderFeedback(overall, results) {
  elements.feedbackPanel.hidden = false;
  elements.resultBadge.textContent = overall.label;
  elements.resultBadge.className = `result-badge ${overall.level}`;
  elements.resultSummary.textContent = overall.summary;
  elements.breakdown.replaceChildren(
    ...results.map((item) => {
      const row = document.createElement("article");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const details = document.createElement("p");
      const solution = document.createElement("div");
      const solutionTitle = document.createElement("span");
      const steps = document.createElement("ol");
      const meter = document.createElement("div");
      const track = document.createElement("div");
      const fill = document.createElement("div");
      const ranges = document.createElement("span");

      row.className = "breakdown-row";
      title.textContent = `${item.label}: ${item.grade.label}`;
      details.textContent = `Your answer: ${formatEstimate(item.guess)} ${item.unit}. Target: ${formatEstimate(item.value)} ${item.unit}.`;
      solution.className = "solution-steps";
      solutionTitle.textContent = "Derivation";
      item.solutionSteps.forEach((step) => {
        const node = document.createElement("li");
        node.textContent = step;
        steps.append(node);
      });

      meter.className = "meter";
      track.className = "meter-track";
      fill.className = `meter-fill ${item.grade.level}`;
      fill.style.width = `${item.grade.accuracy}%`;
      ranges.className = "range-label";
      ranges.textContent = rangeLabel(item.value, item.unit);

      solution.append(solutionTitle, steps);
      copy.append(title, details, solution);
      track.append(fill);
      meter.append(track, ranges);
      row.append(copy, meter);
      return row;
    }),
  );
}

function renderSetSummary() {
  stopTimer();
  const metrics = getSessionMetrics();
  elements.questionView.hidden = true;
  elements.setSummary.hidden = false;
  elements.setSummaryCopy.textContent = `Score ${metrics.score}/${SESSION_LENGTH}. Average miss ${formatPercent(metrics.averageMiss)}. Average time ${formatDuration(metrics.averageTimeMs)}.`;

  elements.summaryGrid.replaceChildren(
    summaryItem("Score", `${metrics.score}/${SESSION_LENGTH}`),
    summaryItem("Great", metrics.great),
    summaryItem("Good", metrics.good),
    summaryItem("Not quite", metrics.notQuite),
    summaryItem("Avg miss", formatPercent(metrics.averageMiss)),
    summaryItem("Avg time", formatDuration(metrics.averageTimeMs)),
    summaryItem("Total time", formatDuration(metrics.totalTimeMs)),
  );

  elements.reviewList.replaceChildren(
    ...state.sessionResults.map((item) => {
      const row = document.createElement("article");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const details = document.createElement("p");
      const grade = document.createElement("span");

      row.className = "review-row";
      title.textContent = `${item.questionNumber}. ${item.question.title}`;
      details.textContent = `${item.question.category} | ${formatPercent(average(item.results.map((result) => result.grade.relativeMiss)))} miss | ${formatDuration(item.elapsedMs)}`;
      grade.className = "review-grade";
      grade.textContent = item.overall.label;

      copy.append(title, details);
      row.append(copy, grade);
      return row;
    }),
  );
  renderSessionStats();
}

function gradeAnswer(guess, expected) {
  const miss = Math.abs(guess - expected);
  const relativeMiss = expected === 0 ? 0 : miss / expected;
  const ratioMiss = guess > 0 && expected > 0 ? Math.max(guess / expected, expected / guess) : Infinity;
  const smallGreat = expected < 10 && miss <= 1;
  const smallGood = expected < 10 && miss <= 3;
  let level = "not-quite";
  let label = "Not quite";

  if (relativeMiss <= 0.2 || smallGreat) {
    level = "great";
    label = "Great";
  } else if (ratioMiss <= 2 || smallGood) {
    level = "good";
    label = "Good";
  }

  return {
    level,
    label,
    relativeMiss,
    accuracy: clamp(Math.round((1 - Math.min(relativeMiss, 1)) * 100), 8, 100),
  };
}

function getOverallGrade(results) {
  const hasMiss = results.some((item) => item.grade.level === "not-quite");
  const allGreat = results.every((item) => item.grade.level === "great");
  const averageMiss = average(results.map((item) => item.grade.relativeMiss));

  if (allGreat) {
    return {
      level: "great",
      label: "Great",
      summary: `Clean estimate. Average miss: ${formatPercent(averageMiss)}.`,
    };
  }

  if (!hasMiss) {
    return {
      level: "good",
      label: "Good",
      summary: `Solid interview-range math. Average miss: ${formatPercent(averageMiss)}.`,
    };
  }

  return {
    level: "not-quite",
    label: "Not quite",
    summary: `Outside the rough range on this one. Average miss: ${formatPercent(averageMiss)}.`,
  };
}

function startTimer() {
  stopTimer(false);
  state.questionStartedAt = Date.now();
  state.elapsedMs = 0;
  state.timerId = window.setInterval(() => {
    state.elapsedMs = Date.now() - state.questionStartedAt;
  }, 250);
}

function stopTimer(captureElapsed = true) {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  if (captureElapsed && state.questionStartedAt) {
    state.elapsedMs = Date.now() - state.questionStartedAt;
  }

  return state.elapsedMs;
}

function renderSessionStats() {
  const metrics = getSessionMetrics();
  const currentQuestion = Math.min(state.questionIndex + 1, SESSION_LENGTH);
  elements.progressStat.textContent = elements.setSummary.hidden ? `${currentQuestion}/${SESSION_LENGTH}` : `${SESSION_LENGTH}/${SESSION_LENGTH}`;
  elements.scoreStat.textContent = `${metrics.score}/${SESSION_LENGTH}`;
  elements.missStat.textContent = metrics.answered ? formatPercent(metrics.averageMiss) : "--";
}

function getSessionMetrics() {
  const answered = state.sessionResults.length;
  const score = state.sessionResults.filter((item) => item.overall.level !== "not-quite").length;
  const great = state.sessionResults.filter((item) => item.overall.level === "great").length;
  const good = state.sessionResults.filter((item) => item.overall.level === "good").length;
  const notQuite = state.sessionResults.filter((item) => item.overall.level === "not-quite").length;
  const totalTimeMs = state.sessionResults.reduce((total, item) => total + item.elapsedMs, 0);
  const averageTimeMs = answered ? totalTimeMs / answered : 0;
  const totalMiss = state.sessionResults.reduce((total, item) => {
    return total + average(item.results.map((result) => result.grade.relativeMiss));
  }, 0);
  const averageMiss = answered ? totalMiss / answered : 0;

  return {
    answered,
    score,
    great,
    good,
    notQuite,
    totalTimeMs,
    averageTimeMs,
    averageMiss,
  };
}

function summaryItem(label, value) {
  const node = document.createElement("div");
  const labelNode = document.createElement("span");
  const valueNode = document.createElement("strong");
  node.className = "summary-item";
  labelNode.textContent = label;
  valueNode.textContent = value;
  node.append(labelNode, valueNode);
  return node;
}

function getSignature(challenge) {
  return [
    challenge.title,
    challenge.copy,
    ...challenge.facts.map((item) => `${item.label}:${item.value}`),
  ].join("|");
}

function fact(label, value) {
  return { label, value: String(value) };
}

function answer(id, label, unit, value, formula, options = {}) {
  return { id, label, unit, value: whole(value), formula, ...options };
}

function getSolutionSteps(item, selectedUnit, expectedValue, unit) {
  const steps = item.steps?.length ? [...item.steps] : [item.formula];

  if (selectedUnit && Number.isFinite(item.baseValue) && item.baseUnit) {
    steps.push(`Convert ${formatEstimate(item.baseValue)} ${item.baseUnit} to ${unit}: ${formatEstimate(item.baseValue)} x ${formatEstimate(selectedUnit.fromBase)} = ${formatEstimate(expectedValue)} ${unit}.`);
    return steps;
  }

  steps.push(`Round to a clean interview estimate: ${formatEstimate(expectedValue)} ${unit}.`);
  return steps;
}

function createUnitControl(item) {
  if (!item.unitOptions || item.unitOptions.length < 2) {
    const unit = document.createElement("span");
    unit.className = "answer-unit";
    unit.textContent = item.unit;
    return unit;
  }

  const select = document.createElement("select");
  select.id = `${item.id}-unit`;
  select.name = `${item.id}-unit`;
  select.className = "answer-unit-select";
  select.required = true;
  select.setAttribute("aria-label", `${item.label} unit`);

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Unit";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);

  item.unitOptions.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.unit;
    node.textContent = option.unit;
    select.append(node);
  });

  return select;
}

function getSelectedUnit(item) {
  if (!item.unitOptions || item.unitOptions.length < 2) {
    return null;
  }

  const selected = elements.answerForm.elements[`${item.id}-unit`]?.value;
  return item.unitOptions.find((option) => option.unit === selected) || null;
}

function storageAnswerFromGB(gbValue, suffix) {
  const unitOptions = storageUnits.map((unit) => ({
    unit: `${unit.label}${suffix}`,
    fromBase: unit.fromGB,
  }));

  return scaledUnitAnswer(gbValue, unitOptions, `GB${suffix}`);
}

function scaledUnitAnswer(baseValue, units, baseUnit) {
  const unitOptions = units.map((unit) => {
    const fromBase = Number.isFinite(unit.fromBase) ? unit.fromBase : unit.value / baseValue;

    return {
      unit: unit.unit,
      fromBase,
      value: baseValue * fromBase,
      toBase: 1 / fromBase,
    };
  });

  return {
    unit: "unit",
    value: baseValue,
    baseValue,
    baseUnit: baseUnit || units[0]?.unit || "base unit",
    unitOptions,
  };
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function whole(value) {
  return Math.max(1, Math.round(value));
}

function average(values) {
  return values.reduce((total, item) => total + item, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatWhole(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatEstimate(value) {
  const absValue = Math.abs(value);
  const rounded = Math.round(value);

  if (absValue === 0 || Math.abs(value - rounded) < 0.000000001 || absValue >= 100) {
    return formatWhole(value);
  }

  if (absValue >= 10) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
  }

  if (absValue >= 1) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }

  if (absValue >= 0.01) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
  }

  return Number(value.toPrecision(2)).toString();
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(value);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function rangeLabel(expected, unit) {
  const greatLow = Math.max(0, expected * 0.8);
  const greatHigh = expected * 1.2;
  const goodLow = Math.max(0, expected * 0.5);
  const goodHigh = expected * 2;
  return `Great ${formatEstimate(greatLow)}-${formatEstimate(greatHigh)} ${unit} | Good ${formatEstimate(goodLow)}-${formatEstimate(goodHigh)} ${unit}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function initColorMode() {
  if (!elements.darkModeToggle) {
    return;
  }

  const savedMode = readStoredMode();
  const isDark = savedMode === "dark";

  setColorMode(isDark, false);
  elements.darkModeToggle.addEventListener("click", () => {
    setColorMode(document.documentElement.dataset.mode !== "dark", true);
  });
}

function setColorMode(isDark, shouldStore) {
  document.documentElement.dataset.mode = isDark ? "dark" : "light";
  elements.darkModeToggle.setAttribute("aria-pressed", String(isDark));
  elements.darkModeToggle.setAttribute("aria-label", isDark ? "Turn off dark mode" : "Turn on dark mode");

  if (shouldStore) {
    writeStoredMode(isDark ? "dark" : "light");
  }
}

function readStoredMode() {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredMode(mode) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Mode persistence is a convenience; the toggle still works without storage.
  }
}

initColorMode();
elements.answerForm.addEventListener("submit", handleSubmit);
elements.nextButton.addEventListener("click", handleNextQuestion);
document.addEventListener("keydown", handleKeyboardAdvance);
elements.clearScratch.addEventListener("click", () => {
  elements.scratchPad.value = "";
  elements.scratchPad.focus();
});
elements.restartSet.addEventListener("click", startNewSet);
elements.retrySet.addEventListener("click", startNewSet);
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    elements.tabs.forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.activeFilter = tab.dataset.filter;
    startNewSet();
  });
});

startNewSet();
