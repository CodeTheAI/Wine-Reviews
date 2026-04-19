const DATASET_FALLBACKS = [
	"./datasets/winemag-data-130k-v2.csv",
	"./datasets/winemag-data_first150k.csv",
];

const PLOT_COLORS = [
	"#8B1E2C",
	"#D26639",
	"#0B7A75",
	"#355C9A",
	"#7C6BA8",
	"#B38A4F",
	"#2F3D4D",
	"#9C3F64",
];

window.ds = [];

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function normalizeText(value, fallback = "Unknown") {
	if (value === null || value === undefined) {
		return fallback;
	}
	const text = String(value).trim();
	return text ? text : fallback;
}

function setStatus(message, tone = "") {
	const statusElement = document.getElementById("status");
	if (!statusElement) {
		return;
	}
	statusElement.textContent = message;
	statusElement.classList.remove("error", "success");
	if (tone === "error" || tone === "success") {
		statusElement.classList.add(tone);
	}
}

function parseCsv(url) {
	return (async () => {
		const parseFromText = (csvText) =>
			new Promise((resolve, reject) => {
				Papa.parse(csvText, {
					header: true,
					dynamicTyping: true,
					skipEmptyLines: true,
					complete: ({ data, errors }) => {
						if (errors.length) {
							reject(new Error(errors[0].message));
							return;
						}
						resolve(data);
					},
					error: (error) => reject(error),
				});
			});

		const parseFromUrl = (targetUrl) =>
			new Promise((resolve, reject) => {
				Papa.parse(targetUrl, {
					download: true,
					header: true,
					dynamicTyping: true,
					skipEmptyLines: true,
					worker: false,
					complete: ({ data, errors }) => {
						if (errors.length) {
							reject(new Error(errors[0].message));
							return;
						}
						resolve(data);
					},
					error: (error) => reject(error),
				});
			});

		let resolvedUrl;
		try {
			resolvedUrl = new URL(url, window.location.href).toString();
		} catch {
			resolvedUrl = url;
		}

		try {
			const response = await fetch(resolvedUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch CSV (${response.status})`);
			}
			const csvText = await response.text();
			return await parseFromText(csvText);
		} catch (fetchError) {
			console.warn("Fetch parse failed, trying URL parse fallback:", fetchError);
			return await parseFromUrl(resolvedUrl);
		}
	})();
}

function countBy(rows, accessor) {
	const map = new Map();
	for (const row of rows) {
		const key = accessor(row);
		map.set(key, (map.get(key) || 0) + 1);
	}
	return map;
}

function topEntries(map, limit = 10) {
	return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function percentile(sortedValues, q) {
	if (!sortedValues.length) {
		return null;
	}
	const position = (sortedValues.length - 1) * q;
	const base = Math.floor(position);
	const rest = position - base;
	const next = sortedValues[base + 1] !== undefined ? sortedValues[base + 1] : sortedValues[base];
	return sortedValues[base] + rest * (next - sortedValues[base]);
}

function chartLayout(title) {
	return {
		title: {
			text: title,
			x: 0.03,
			xanchor: "left",
			font: { family: "Fraunces, serif", size: 20, color: "#23252c" },
		},
		margin: { l: 140, r: 25, t: 58, b: 46 },
		paper_bgcolor: "rgba(0,0,0,0)",
		plot_bgcolor: "rgba(255,255,255,0.68)",
		font: { family: "Manrope, sans-serif", color: "#2f3542" },
		xaxis: {
			gridcolor: "rgba(40, 44, 52, 0.08)",
			zerolinecolor: "rgba(40, 44, 52, 0.14)",
		},
		yaxis: {
			gridcolor: "rgba(40, 44, 52, 0.08)",
			zerolinecolor: "rgba(40, 44, 52, 0.14)",
		},
	};
}

function chartConfig() {
	return {
		responsive: true,
		displayModeBar: false,
	};
}

function markerLine() {
	return {
		color: "rgba(17, 20, 25, 0.3)",
		width: 1,
	};
}

function sanitizeRows(rows) {
	return rows.map((row) => ({
		country: normalizeText(row.country),
		province: normalizeText(row.province),
		variety: normalizeText(row.variety),
		winery: normalizeText(row.winery),
		description: normalizeText(row.description, ""),
		price: toNumber(row.price),
		points: toNumber(row.points),
	}));
}

function updateSummary(rows) {
	const total = rows.length;
	const prices = rows.map((row) => row.price).filter((value) => value !== null).sort((a, b) => a - b);
	const points = rows.map((row) => row.points).filter((value) => value !== null);
	const countries = new Set(rows.map((row) => row.country));
	const topVariety = topEntries(countBy(rows, (row) => row.variety), 1)[0]?.[0] || "N/A";

	const avgScore =
		points.length > 0
			? (points.reduce((sum, value) => sum + value, 0) / points.length).toFixed(1)
			: "N/A";
	const medianPrice = prices.length > 0 ? percentile(prices, 0.5)?.toFixed(0) : null;

	document.getElementById("metricTotal").textContent = total.toLocaleString();
	document.getElementById("metricAvgScore").textContent = avgScore;
	document.getElementById("metricMedianPrice").textContent = medianPrice ? `$${medianPrice}` : "N/A";
	document.getElementById("metricCountries").textContent = countries.size.toLocaleString();
	document.getElementById("metricTopVariety").textContent = topVariety;
}

function renderCountryVolume(rows) {
	const topCountries = topEntries(countBy(rows, (row) => row.country), 14).reverse();
	Plotly.react(
		"countryVolumeChart",
		[
			{
				type: "bar",
				x: topCountries.map((entry) => entry[1]),
				y: topCountries.map((entry) => entry[0]),
				orientation: "h",
				marker: {
					color: topCountries.map((_, index) => PLOT_COLORS[index % PLOT_COLORS.length]),
					line: markerLine(),
				},
				hovertemplate: "%{y}<br>Reviews: %{x:,}<extra></extra>",
			},
		],
		chartLayout("Review Volume By Country"),
		chartConfig()
	);
}

function renderCountryQuality(rows) {
	const accumulator = new Map();
	for (const row of rows) {
		if (row.points === null) {
			continue;
		}
		const current = accumulator.get(row.country) || { totalPoints: 0, count: 0 };
		current.totalPoints += row.points;
		current.count += 1;
		accumulator.set(row.country, current);
	}

	const ranked = [...accumulator.entries()]
		.filter(([, value]) => value.count >= 300)
		.map(([country, value]) => ({
			country,
			average: value.totalPoints / value.count,
			count: value.count,
		}))
		.sort((a, b) => b.average - a.average)
		.slice(0, 12)
		.reverse();

	Plotly.react(
		"countryQualityChart",
		[
			{
				type: "bar",
				x: ranked.map((entry) => Number(entry.average.toFixed(2))),
				y: ranked.map((entry) => entry.country),
				orientation: "h",
				marker: {
					color: "#0B7A75",
					line: markerLine(),
				},
				customdata: ranked.map((entry) => entry.count),
				hovertemplate:
					"%{y}<br>Avg score: %{x}<br>Reviews: %{customdata:,}<extra></extra>",
			},
		],
		chartLayout("Average Score Leaders"),
		chartConfig()
	);
}

function renderPriceDistribution(rows) {
	const prices = rows
		.map((row) => row.price)
		.filter((price) => price !== null && price > 0 && price <= 400);

	Plotly.react(
		"priceDistributionChart",
		[
			{
				type: "histogram",
				x: prices,
				nbinsx: 40,
				marker: {
					color: "#D26639",
					line: markerLine(),
				},
				hovertemplate: "Price range: %{x}<br>Reviews: %{y:,}<extra></extra>",
			},
		],
		{
			...chartLayout("Price Distribution (0-400 USD)"),
			xaxis: { title: "Price (USD)", gridcolor: "rgba(40, 44, 52, 0.08)" },
			yaxis: { title: "Review count", gridcolor: "rgba(40, 44, 52, 0.08)" },
		},
		chartConfig()
	);
}

function renderScoreDistribution(rows) {
	const points = rows.map((row) => row.points).filter((pointsValue) => pointsValue !== null);

	Plotly.react(
		"scoreDistributionChart",
		[
			{
				type: "histogram",
				x: points,
				nbinsx: 24,
				marker: {
					color: "#355C9A",
					line: markerLine(),
				},
				hovertemplate: "Score: %{x}<br>Reviews: %{y:,}<extra></extra>",
			},
		],
		{
			...chartLayout("Score Distribution"),
			xaxis: { title: "Points", gridcolor: "rgba(40, 44, 52, 0.08)" },
			yaxis: { title: "Review count", gridcolor: "rgba(40, 44, 52, 0.08)" },
		},
		chartConfig()
	);
}

function renderPriceScoreScatter(rows) {
	const pointsWithPrice = rows.filter(
		(row) => row.price !== null && row.price > 0 && row.price <= 350 && row.points !== null
	);

	const sampled = [];
	const sampleLimit = 4500;
	const step = Math.max(1, Math.floor(pointsWithPrice.length / sampleLimit));
	for (let i = 0; i < pointsWithPrice.length && sampled.length < sampleLimit; i += step) {
		sampled.push(pointsWithPrice[i]);
	}

	Plotly.react(
		"priceScoreScatterChart",
		[
			{
				type: "scattergl",
				mode: "markers",
				x: sampled.map((row) => row.price),
				y: sampled.map((row) => row.points),
				marker: {
					size: 6,
					color: sampled.map((row) => row.points),
					colorscale: [
						[0, "#F3C98B"],
						[0.5, "#D26639"],
						[1, "#8B1E2C"],
					],
					opacity: 0.7,
					line: markerLine(),
					colorbar: {
						title: "Points",
						thickness: 12,
						titlefont: { family: "Manrope, sans-serif", size: 11 },
					},
				},
				hovertemplate: "Price: $%{x}<br>Points: %{y}<extra></extra>",
			},
		],
		{
			...chartLayout("Price vs Score Relationship"),
			xaxis: { title: "Price (USD)", gridcolor: "rgba(40, 44, 52, 0.08)" },
			yaxis: { title: "Points", gridcolor: "rgba(40, 44, 52, 0.08)" },
		},
		chartConfig()
	);
}

function renderVarietyTreemap(rows) {
	const topVarieties = topEntries(countBy(rows, (row) => row.variety), 25);

	Plotly.react(
		"varietyTreemapChart",
		[
			{
				type: "treemap",
				labels: topVarieties.map((entry) => entry[0]),
				parents: topVarieties.map(() => "All Varieties"),
				values: topVarieties.map((entry) => entry[1]),
				branchvalues: "total",
				marker: {
					colors: topVarieties.map((_, index) => PLOT_COLORS[index % PLOT_COLORS.length]),
					line: markerLine(),
				},
				hovertemplate: "%{label}<br>Reviews: %{value:,}<extra></extra>",
			},
		],
		{
			...chartLayout("Most Reviewed Varieties"),
			margin: { l: 15, r: 15, t: 54, b: 10 },
		},
		chartConfig()
	);
}

function renderWineryLeaders(rows) {
	const topWineries = topEntries(countBy(rows, (row) => row.winery), 16).reverse();

	Plotly.react(
		"wineryLeadersChart",
		[
			{
				type: "bar",
				x: topWineries.map((entry) => entry[1]),
				y: topWineries.map((entry) => entry[0]),
				orientation: "h",
				marker: {
					color: "#2F3D4D",
					line: markerLine(),
				},
				hovertemplate: "%{y}<br>Reviews: %{x:,}<extra></extra>",
			},
		],
		chartLayout("Top Wineries By Review Count"),
		chartConfig()
	);
}

function renderPriceByCountry(rows) {
	const countryCounts = topEntries(countBy(rows, (row) => row.country), 8).map((entry) => entry[0]);
	const traces = countryCounts.map((country, index) => {
		const prices = rows
			.filter((row) => row.country === country && row.price !== null && row.price <= 350)
			.map((row) => row.price)
			.slice(0, 1500);

		return {
			type: "box",
			name: country,
			y: prices,
			boxmean: true,
			marker: { color: PLOT_COLORS[index % PLOT_COLORS.length] },
			line: markerLine(),
			hovertemplate: `${country}<br>Price: $%{y}<extra></extra>`,
		};
	});

	Plotly.react(
		"priceByCountryChart",
		traces,
		{
			...chartLayout("Price Spread Across Major Countries"),
			xaxis: { title: "Country", gridcolor: "rgba(40, 44, 52, 0.08)" },
			yaxis: { title: "Price (USD)", gridcolor: "rgba(40, 44, 52, 0.08)" },
		},
		chartConfig()
	);
}

function renderScoreBands(rows) {
	const bands = {
		"Under 85": 0,
		"85-89": 0,
		"90-94": 0,
		"95+": 0,
	};

	for (const row of rows) {
		if (row.points === null) {
			continue;
		}
		if (row.points < 85) {
			bands["Under 85"] += 1;
		} else if (row.points < 90) {
			bands["85-89"] += 1;
		} else if (row.points < 95) {
			bands["90-94"] += 1;
		} else {
			bands["95+"] += 1;
		}
	}

	Plotly.react(
		"scoreBandsChart",
		[
			{
				type: "pie",
				labels: Object.keys(bands),
				values: Object.values(bands),
				hole: 0.56,
				sort: false,
				marker: {
					colors: ["#355C9A", "#0B7A75", "#D26639", "#8B1E2C"],
					line: markerLine(),
				},
				hovertemplate: "%{label}<br>Reviews: %{value:,}<br>%{percent}<extra></extra>",
			},
		],
		{
			...chartLayout("Distribution Across Score Bands"),
			margin: { l: 25, r: 25, t: 58, b: 25 },
			showlegend: true,
			legend: { orientation: "h", y: -0.08 },
		},
		chartConfig()
	);
}

function renderValueIndex(rows) {
	const groups = new Map();
	for (const row of rows) {
		if (row.points === null || row.price === null || row.price <= 0) {
			continue;
		}
		const current = groups.get(row.country) || {
			pointsSum: 0,
			priceSum: 0,
			count: 0,
		};
		current.pointsSum += row.points;
		current.priceSum += row.price;
		current.count += 1;
		groups.set(row.country, current);
	}

	const indexValues = [...groups.entries()]
		.filter(([, value]) => value.count >= 250)
		.map(([country, value]) => {
			const avgPoints = value.pointsSum / value.count;
			const avgPrice = value.priceSum / value.count;
			return {
				country,
				valueIndex: (avgPoints / avgPrice) * 10,
				count: value.count,
			};
		})
		.sort((a, b) => b.valueIndex - a.valueIndex)
		.slice(0, 14)
		.reverse();

	Plotly.react(
		"valueIndexChart",
		[
			{
				type: "bar",
				x: indexValues.map((entry) => Number(entry.valueIndex.toFixed(2))),
				y: indexValues.map((entry) => entry.country),
				orientation: "h",
				marker: {
					color: "#9C3F64",
					line: markerLine(),
				},
				customdata: indexValues.map((entry) => entry.count),
				hovertemplate:
					"%{y}<br>Value index: %{x}<br>Samples: %{customdata:,}<extra></extra>",
			},
		],
		chartLayout("Value Index (Score Per Dollar)"),
		chartConfig()
	);
}

function renderFlavorLexicon(rows) {
	const stopWords = new Set([
		"the",
		"and",
		"with",
		"this",
		"that",
		"from",
		"wine",
		"aromas",
		"aroma",
		"palate",
		"finish",
		"flavors",
		"flavor",
		"notes",
		"note",
		"shows",
		"show",
		"into",
		"very",
		"more",
		"than",
		"its",
		"it",
		"is",
		"of",
		"to",
		"for",
		"on",
		"in",
		"a",
		"an",
		"at",
		"by",
		"as",
	]);

	const words = new Map();
	const descriptionRows = rows.filter((row) => row.description);
	const sampleSize = Math.min(20000, descriptionRows.length);
	const step = Math.max(1, Math.floor(descriptionRows.length / sampleSize));

	for (let index = 0; index < descriptionRows.length; index += step) {
		const text = descriptionRows[index].description.toLowerCase();
		const tokens = text.match(/[a-z]{4,}/g) || [];
		for (const token of tokens) {
			if (stopWords.has(token)) {
				continue;
			}
			words.set(token, (words.get(token) || 0) + 1);
		}
	}

	const topWords = [...words.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)
		.reverse();

	Plotly.react(
		"flavorLexiconChart",
		[
			{
				type: "bar",
				x: topWords.map((entry) => entry[1]),
				y: topWords.map((entry) => entry[0]),
				orientation: "h",
				marker: {
					color: topWords.map((_, index) => PLOT_COLORS[index % PLOT_COLORS.length]),
					line: markerLine(),
				},
				hovertemplate: "%{y}<br>Mentions: %{x:,}<extra></extra>",
			},
		],
		chartLayout("Most Frequent Descriptive Terms"),
		chartConfig()
	);
}

function revealPanels() {
	document.getElementById("summaryPanel").classList.remove("hidden");
	document.getElementById("dashboard").classList.remove("hidden");
}

function clonePlotObject(value) {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}

function openVisualizationModal(card) {
	const modal = document.getElementById("vizModal");
	const modalTitle = document.getElementById("vizModalTitle");
	const modalDescription = document.getElementById("vizModalDescription");
	const modalChart = document.getElementById("modalChart");
	const sourceChart = card.querySelector(".chart");

	if (!modal || !modalTitle || !modalDescription || !modalChart || !sourceChart) {
		return;
	}

	if (!sourceChart.data || !sourceChart.layout) {
		return;
	}

	const title = card.querySelector("h2")?.textContent?.trim() || "Expanded Visualization";
	const description = card.querySelector("p")?.textContent?.trim() || "Detailed chart view";

	modalTitle.textContent = title;
	modalDescription.textContent = description;

	document.body.classList.add("modal-open");
	modal.classList.add("open");
	modal.setAttribute("aria-hidden", "false");

	const modalLayout = clonePlotObject(sourceChart.layout);
	const modalData = clonePlotObject(sourceChart.data);

	if (modalLayout?.title) {
		modalLayout.title = {
			text: "",
		};
	}
	modalLayout.margin = modalLayout.margin || {};
	modalLayout.margin.t = Math.max(36, Number(modalLayout.margin.t || 0));

	const baseConfig = {
		responsive: true,
		displaylogo: false,
		scrollZoom: true,
	};
	const sourceConfig = sourceChart._context || {};
	const modalConfig = {
		...sourceConfig,
		...baseConfig,
	};

	Plotly.purge(modalChart);
	Plotly.newPlot(modalChart, modalData, modalLayout, modalConfig).then(() => {
		Plotly.Plots.resize(modalChart);
	});
}

function closeVisualizationModal() {
	const modal = document.getElementById("vizModal");
	const modalChart = document.getElementById("modalChart");
	if (!modal || !modal.classList.contains("open")) {
		return;
	}

	modal.classList.remove("open");
	modal.setAttribute("aria-hidden", "true");
	document.body.classList.remove("modal-open");

	if (modalChart) {
		Plotly.purge(modalChart);
		modalChart.innerHTML = "";
	}
}

function setupVisualizationModal() {
	const dashboard = document.getElementById("dashboard");
	const modal = document.getElementById("vizModal");
	const closeButton = document.getElementById("closeVizModal");

	if (!modal || !closeButton) {
		return;
	}

	dashboard.addEventListener("click", (event) => {
		const clickedCard = event.target.closest(".viz-card");
		if (!clickedCard || !dashboard.contains(clickedCard)) {
			return;
		}
		openVisualizationModal(clickedCard);
	});

	closeButton.addEventListener("click", closeVisualizationModal);

	modal.addEventListener("click", (event) => {
		if (event.target === modal) {
			closeVisualizationModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeVisualizationModal();
		}
	});

	window.addEventListener("resize", () => {
		if (!modal.classList.contains("open")) {
			return;
		}
		const modalChart = document.getElementById("modalChart");
		if (modalChart && modalChart.data) {
			Plotly.Plots.resize(modalChart);
		}
	});
}

function resizeAllCharts() {
	const chartIds = [
		"countryVolumeChart",
		"countryQualityChart",
		"priceDistributionChart",
		"scoreDistributionChart",
		"priceScoreScatterChart",
		"varietyTreemapChart",
		"wineryLeadersChart",
		"priceByCountryChart",
		"scoreBandsChart",
		"valueIndexChart",
		"flavorLexiconChart",
	];

	for (const chartId of chartIds) {
		const element = document.getElementById(chartId);
		if (element) {
			Plotly.Plots.resize(element);
		}
	}
}

function renderDashboard(rows) {
	updateSummary(rows);
	renderCountryVolume(rows);
	renderCountryQuality(rows);
	renderPriceDistribution(rows);
	renderScoreDistribution(rows);
	renderPriceScoreScatter(rows);
	renderVarietyTreemap(rows);
	renderWineryLeaders(rows);
	renderPriceByCountry(rows);
	renderScoreBands(rows);
	renderValueIndex(rows);
	renderFlavorLexicon(rows);
	revealPanels();
	requestAnimationFrame(() => {
		setTimeout(resizeAllCharts, 100);
	});
}

async function loadSelectedDataset() {
	const datasetSelect = document.getElementById("datasetSelect");
	const button = document.getElementById("loadButton");
	const selectedPath = datasetSelect?.value || DATASET_FALLBACKS[0];
	const candidatePaths = [selectedPath, ...DATASET_FALLBACKS.filter((path) => path !== selectedPath)];

	button.disabled = true;
	setStatus("Loading dataset and preparing visualizations...");

	try {
		let loaded = null;
		for (const path of candidatePaths) {
			try {
				const parsed = await parseCsv(path);
				loaded = { path, rows: parsed };
				break;
			} catch (error) {
				console.warn(`Unable to read ${path}:`, error);
			}
		}

		if (!loaded) {
			throw new Error("No dataset file was reachable in the datasets folder.");
		}

		setStatus("Cleaning dataset and building chart data...");
		const cleanRows = sanitizeRows(loaded.rows);
		window.ds = cleanRows;

		renderDashboard(cleanRows);
		setStatus(
			`Dashboard ready: ${cleanRows.length.toLocaleString()} rows loaded from ${loaded.path.replace("./datasets/", "")}.`,
			"success"
		);
		window.dispatchEvent(
			new CustomEvent("dataset:loaded", {
				detail: {
					size: cleanRows.length,
					source: loaded.path,
				},
			})
		);
	} catch (error) {
		console.error("Dataset visualization failed:", error);
		window.ds = [];
		setStatus(`Could not build dashboard: ${error.message}`, "error");
	} finally {
		button.disabled = false;
	}
}

window.loadDataset = loadSelectedDataset;

function setupOpeningLoader() {
	const openingLoader = document.getElementById("openingLoader");
	if (!openingLoader) {
		return;
	}

	const startExit = () => {
		openingLoader.classList.add("exit");
		document.body.classList.remove("intro-active");
	};

	window.setTimeout(startExit, 5000);

	openingLoader.addEventListener("transitionend", (event) => {
		if (event.propertyName !== "transform") {
			return;
		}
		openingLoader.remove();
	});
}

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("loadButton");
	button.addEventListener("click", loadSelectedDataset);
	setupOpeningLoader();
	setupVisualizationModal();
	setStatus("Pick a dataset and generate your visual dashboard.");
});
