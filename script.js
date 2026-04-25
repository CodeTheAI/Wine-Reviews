// Dataset configuration and fallback paths for loading CSV data
const DATASET_FALLBACKS = [
	"./datasets/winemag-data-130k-v2.csv",
	"./datasets/winemag-data_first150k.csv",
];

// Color palette for consistent visualization styling across all charts
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

// Global dataset storage - holds all cleaned and processed wine review data
window.ds = [];
window.dsView = [];

// ===== UTILITY FUNCTIONS: Data Type Conversion & Validation =====

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

// Updates the status message displayed to the user with optional styling tone
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

// ===== CSV PARSING: Load and parse CSV data from URLs =====

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

// ===== DATA AGGREGATION & STATISTICS: Helper functions for data analysis =====

function countBy(rows, accessor) {
	const map = new Map();
	for (const row of rows) {
		const key = accessor(row);
		map.set(key, (map.get(key) || 0) + 1);
	}
	return map;
}

// Returns the top N entries from a Map sorted by value in descending order
function topEntries(map, limit = 10) {
	return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// Calculates the percentile value from a sorted array (q: 0-1, where 0.5 is median)
function percentile(sortedValues, q) {
	if (!sortedValues.length) {
		return null;
	}
	const position = (sortedValues.length - 1) * q;
	const base = Math.floor(position);
	const rest = position - base;
// ===== CHART CONFIGURATION: Plotly layout and styling functions =====

// Standard chart layout configuration with consistent title and axis styling
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
		title: normalizeText(row.title),
		country: normalizeText(row.country),
		province: normalizeText(row.province),
		variety: normalizeText(row.variety),
		winery: normalizeText(row.winery),
		description: normalizeText(row.description, ""),
		price: toNumber(row.price),
		points: toNumber(row.points),
	}));
}

function mean(values) {
	if (!values.length) {
		return 0;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values) {
	if (!values.length) {
		return 0;
	}
	const avg = mean(values);
	const sumSquares = values.reduce((sum, value) => sum + (value - avg) ** 2, 0);
	return sumSquares / values.length;
}

function stdDev(values) {
	return Math.sqrt(variance(values));
}

function pearsonCorr(xValues, yValues) {
	if (!xValues.length || xValues.length !== yValues.length) {
		return 0;
	}

	const xMean = mean(xValues);
	const yMean = mean(yValues);

	let numerator = 0;
	let xDenominator = 0;
	let yDenominator = 0;

	for (let index = 0; index < xValues.length; index += 1) {
		const xDiff = xValues[index] - xMean;
		const yDiff = yValues[index] - yMean;
		numerator += xDiff * yDiff;
		xDenominator += xDiff ** 2;
		yDenominator += yDiff ** 2;
	}

	const denominator = Math.sqrt(xDenominator * yDenominator);
	if (!denominator) {
		return 0;
	}

	return numerator / denominator;
}

function linearRegression(xValues, yValues) {
	if (!xValues.length || xValues.length !== yValues.length) {
		return { slope: 0, intercept: 0, rSquared: 0 };
	}

	const xMean = mean(xValues);
	const yMean = mean(yValues);

	let numerator = 0;
	let denominator = 0;

	for (let index = 0; index < xValues.length; index += 1) {
		const xDiff = xValues[index] - xMean;
		numerator += xDiff * (yValues[index] - yMean);
		denominator += xDiff ** 2;
	}

	const slope = denominator ? numerator / denominator : 0;
	const intercept = yMean - slope * xMean;
	const r = pearsonCorr(xValues, yValues);

	return {
		slope,
		intercept,
		rSquared: r ** 2,
	};
}

function correlationInterpretation(rValue) {
	const magnitude = Math.abs(rValue);
	const strength = magnitude >= 0.7 ? "Strong" : magnitude >= 0.4 ? "Moderate" : "Weak";
	const direction = rValue > 0 ? "Positive" : rValue < 0 ? "Negative" : "Neutral";
	return `${strength} ${direction}`;
}

function formatNumber(value, decimals = 2) {
	return Number(value).toFixed(decimals);
}

function formatCurrency(value) {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return "N/A";
	}
	return `$${Number(value).toFixed(0)}`;
}

function getFilteredSortedRows() {
	const filterInput = document.getElementById("filterInput");
	const sortSelect = document.getElementById("sortSelect");

	const query = (filterInput?.value || "").trim().toLowerCase();
	const sortKey = sortSelect?.value || "";

	let rows = [...window.ds];

	if (query) {
		rows = rows.filter((row) =>
			[row.country, row.variety, row.winery, row.title, row.province, row.description].some((value) =>
				String(value).toLowerCase().includes(query)
			)
		);
	}

	if (sortKey === "points") {
		rows.sort((a, b) => (b.points ?? -Infinity) - (a.points ?? -Infinity));
	} else if (sortKey === "price") {
		rows.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
	} else if (sortKey === "country") {
		rows.sort((a, b) => a.country.localeCompare(b.country));
	} else if (sortKey === "variety") {
		rows.sort((a, b) => a.variety.localeCompare(b.variety));
	}

	return rows;
}

function updateRowCount(viewLength, totalLength = window.ds.length) {
	const rowCountElement = document.getElementById("rowCount");
	if (!rowCountElement) {
		return;
	}
	rowCountElement.textContent = `${viewLength.toLocaleString()} rows${totalLength !== viewLength ? ` of ${totalLength.toLocaleString()}` : ""}`;
}

function renderTable(rows) {
	const tbody = document.getElementById("tableBody");
	if (!tbody) {
		return 0;
	}

	tbody.innerHTML = "";

	if (!rows.length) {
		tbody.innerHTML =
			'<tr><td colspan="7" style="text-align:center;padding:22px;color:#5f6472;">No results found.</td></tr>';
		updateRowCount(0, window.ds.length);
		window.dsView = [];
		return 0;
	}

	const visibleRows = rows.slice(0, 300);
	window.dsView = visibleRows;
	updateRowCount(visibleRows.length, rows.length);

	const fragment = document.createDocumentFragment();
	for (let index = 0; index < visibleRows.length; index += 1) {
		const row = visibleRows[index];
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${index + 1}</td>
			<td>${row.country}</td>
			<td>${row.variety}</td>
			<td>${row.winery}</td>
			<td>${row.points ?? "N/A"}</td>
			<td>${formatCurrency(row.price)}</td>
			<td>${row.province}</td>
		`;
		fragment.appendChild(tr);
	}

	tbody.appendChild(fragment);
	return visibleRows.length;
}

function applyFilterSort() {
	const rows = getFilteredSortedRows();
	const shown = renderTable(rows);
	updateSummary(rows, shown);
}

function resetTable() {
	const filterInput = document.getElementById("filterInput");
	const sortSelect = document.getElementById("sortSelect");
	if (filterInput) {
		filterInput.value = "";
	}
	if (sortSelect) {
		sortSelect.value = "";
	}
	const shown = renderTable(window.ds);
	updateSummary(window.ds, shown);
}

window.applyFilterSort = applyFilterSort;
window.resetTable = resetTable;

function renderAnalysis(rows) {
	const points = rows.map((row) => row.points).filter((value) => value !== null);
	const pricedRows = rows.filter((row) => row.price !== null && row.price > 0 && row.points !== null);
	const prices = pricedRows.map((row) => row.price);
	const pricedPoints = pricedRows.map((row) => row.points);
	const descRows = rows.filter((row) => row.points !== null);
	const descriptionLengths = descRows.map((row) => row.description.length);
	const descPoints = descRows.map((row) => row.points);

	let minScore = 0;
	let maxScore = 0;
	if (points.length) {
		minScore = points[0];
		maxScore = points[0];
		for (let index = 1; index < points.length; index += 1) {
			const value = points[index];
			if (value < minScore) {
				minScore = value;
			}
			if (value > maxScore) {
				maxScore = value;
			}
		}
	}
	const scoreVariance = variance(points);
	const scoreStdDev = stdDev(points);

	const rPricePoints = pearsonCorr(prices, pricedPoints);
	const rDescPoints = pearsonCorr(descriptionLengths, descPoints);
	const regression = linearRegression(prices, pricedPoints);

	const stronger = Math.abs(rPricePoints) >= Math.abs(rDescPoints) ? "Price" : "Description Length";
	const direction =
		rPricePoints > 0 && rDescPoints > 0
			? "Both positive"
			: rPricePoints < 0 && rDescPoints < 0
				? "Both negative"
				: "Mixed";

	const setText = (id, value) => {
		const element = document.getElementById(id);
		if (element) {
			element.textContent = value;
		}
	};

	setText("an", points.length.toLocaleString());
	setText("aMin", String(minScore));
	setText("aMax", String(maxScore));
	setText("aRange", String(maxScore - minScore));
	setText("aVariance", formatNumber(scoreVariance));
	setText("aStdDev", formatNumber(scoreStdDev));

	setText("rPearson", formatNumber(rPricePoints, 4));
	setText("rInterp", correlationInterpretation(rPricePoints));
	setText("rPearson2", formatNumber(rDescPoints, 4));
	setText("rInterp2", correlationInterpretation(rDescPoints));
	setText("rStronger", stronger);
	setText("rDirection", direction);

	setText("regEquation", `score = ${formatNumber(regression.slope, 4)}*price + ${formatNumber(regression.intercept, 4)}`);
	setText("regSlope", formatNumber(regression.slope, 4));
	setText("regIntercept", formatNumber(regression.intercept, 4));
	setText("regR2", formatNumber(regression.rSquared, 4));
	setText("regInterp", regression.rSquared >= 0.9 ? "Excellent fit" : regression.rSquared >= 0.7 ? "Good fit" : "Weak fit");
	setText("regPredict", formatNumber(regression.slope * 50 + regression.intercept, 1));
}

function renderInsights(rows) {
	const points = rows.map((row) => row.points).filter((value) => value !== null);
	const pricedRows = rows.filter((row) => row.price !== null && row.price > 0 && row.points !== null);
	const prices = pricedRows.map((row) => row.price);
	const pricedPoints = pricedRows.map((row) => row.points);
	const descRows = rows.filter((row) => row.points !== null);
	const descriptionLengths = descRows.map((row) => row.description.length);
	const descPoints = descRows.map((row) => row.points);

	const avgScore = mean(points);
	const priceCorr = pearsonCorr(prices, pricedPoints);
	const descCorr = pearsonCorr(descriptionLengths, descPoints);
	const strongestLabel =
		Math.abs(priceCorr) >= Math.abs(descCorr)
			? "price"
			: "description length";
	const regression = linearRegression(prices, pricedPoints);
	const predictedAt50 = regression.slope * 50 + regression.intercept;
	const expensiveShare =
		rows.length > 0
			? (rows.filter((row) => row.price !== null && row.price >= 50).length / rows.length) * 100
			: 0;

	const topCountry = topEntries(countBy(rows, (row) => row.country), 1)[0]?.[0] || "N/A";

	const insightsBody = document.getElementById("insightsBody");
	if (!insightsBody) {
		return;
	}

	insightsBody.innerHTML = `
		<p class="insight-text">
			The loaded dataset contains <span class="highlight">${rows.length.toLocaleString()}</span> reviews with a mean score of
			<span class="highlight">${formatNumber(avgScore, 2)}</span>. The strongest measured linear signal in this report is
			<span class="highlight">${strongestLabel}</span>, while the price-to-score correlation is
			<span class="highlight">${formatNumber(priceCorr, 4)}</span>. The regression model projects a score near
			<span class="highlight">${formatNumber(predictedAt50, 1)}</span> for wines priced around $50, which is best interpreted as a broad trend, not a guarantee.
			The largest share of reviews comes from <span class="highlight">${topCountry}</span>, and about
			<span class="highlight">${formatNumber(expensiveShare, 1)}%</span> of entries are priced at $50 or above.
		</p>
	`;
}

function updateSummary(rows, shownCount = rows.length) {
	const total = rows.length;
	const prices = rows.map((row) => row.price).filter((value) => value !== null).sort((a, b) => a - b);
	const points = rows.map((row) => row.points).filter((value) => value !== null);
	const topVariety = topEntries(countBy(rows, (row) => row.variety), 1)[0]?.[0] || "N/A";

	const avgScore =
		points.length > 0
			? (points.reduce((sum, value) => sum + value, 0) / points.length).toFixed(1)
			: "N/A";
	const medianPrice = prices.length > 0 ? percentile(prices, 0.5)?.toFixed(0) : null;

	document.getElementById("metricTotal").textContent = total.toLocaleString();
	document.getElementById("metricAvgScore").textContent = avgScore;
	document.getElementById("metricMedianPrice").textContent = medianPrice ? `$${medianPrice}` : "N/A";
	document.getElementById("metricCountries").textContent = Number(shownCount || 0).toLocaleString();
	document.getElementById("metricTopVariety").textContent = topVariety;
}

// ===== CHART RENDERING: Individual visualization functions =====

// Review volume by country - horizontal bar chart
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

// Quality rankings by country - average score comparison
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

// Price distribution histogram - shows bottle price spread
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

// Expert rating distribution - where most scores cluster
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

// Price vs score scatter plot - analyze correlation between price and ratings
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

// Most reviewed grape varieties - treemap visualization
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
// Most frequently reviewed wineries

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

// Price range comparison across top wine-producing countries
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
// Score banding - visualize rating tiers

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
// Value index - price-to-score ratio analysis

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
// Flavor descriptors word cloud - analyze review language patterns

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

// ===== UI INTERACTIONS: Modal and panel management =====

function revealPanels() {
	const datasetSection = document.getElementById("datasetSection");
	const vizHeader = document.getElementById("vizHeader");
	const analysisSection = document.getElementById("analysisSection");
	if (datasetSection) {
		datasetSection.classList.remove("hidden");
	}
	if (vizHeader) {
		vizHeader.classList.remove("hidden");
	}
	if (analysisSection) {
		analysisSection.classList.remove("hidden");
	}
	document.getElementById("summaryPanel").classList.remove("hidden");
	document.getElementById("dashboard").classList.remove("hidden");
}

function clonePlotObject(value) {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}

// Opens detailed visualization modal with expanded chart
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

// Closes the expanded visualization modal
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

// Initializes modal click handlers and keyboard interactions
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

// ===== CHART MANAGEMENT: Purge and initialize all chart elements =====

// Removes all existing Plotly charts from the DOM
function purgeAllCharts() {
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
			Plotly.purge(element);
		}
	}
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
// ===== MAIN DASHBOARD RENDERER: Orchestrates all visualizations =====

// Purges old charts, updates summary, and renders all visualizations
	}
}

function renderDashboard(rows) {
	purgeAllCharts();
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
// ===== DATASET LOADING & INITIALIZATION =====

// Main function: Loads selected dataset, sanitizes it, and renders dashboard
// Hides old visualizations when switching datasets to match initial page load behavior
	});
}

async function loadSelectedDataset() {
	const datasetSelect = document.getElementById("datasetSelect");
	const button = document.getElementById("loadButton");
	const selectedPath = datasetSelect?.value || DATASET_FALLBACKS[0];
	const candidatePaths = [selectedPath, ...DATASET_FALLBACKS.filter((path) => path !== selectedPath)];

	if (button) {
		button.disabled = true;
	}
	// Hide previous visualizations while loading a new dataset.
	const summaryPanel = document.getElementById("summaryPanel");
	const dashboard = document.getElementById("dashboard");
	if (summaryPanel) {
		summaryPanel.classList.add("hidden");
	}
	if (dashboard) {
		dashboard.classList.add("hidden");
	}
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
		const shown = renderTable(cleanRows);
		updateSummary(cleanRows, shown);
		renderAnalysis(cleanRows);
		renderInsights(cleanRows);
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
		if (button) {
			button.disabled = false;
		}
	}
// ===== SETUP FUNCTIONS: Initialize page elements and event listeners =====

// Initializes the opening loader animation sequence
}

window.loadDataset = loadSelectedDataset;

function setupOpeningLoader() {
	const openingLoader = document.getElementById("openingLoader");
	if (!openingLoader) {
		return;
	}

	let removed = false;

	const removeLoader = () => {
		if (removed) {
			return;
		}
		removed = true;
		openingLoader.remove();
	};

	const startExit = () => {
		openingLoader.classList.add("exit");
		document.body.classList.remove("intro-active");
	};

	window.setTimeout(startExit, 3000);
	window.setTimeout(removeLoader, 4000);

	openingLoader.addEventListener("transitionend", (event) => {
		if (event.propertyName !== "transform") {
			return;
		}
		removeLoader();
// Initializes the page when DOM is fully loaded
	});
}

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("loadButton");
	if (button) {
		button.addEventListener("click", loadSelectedDataset);
	}

	const filterInput = document.getElementById("filterInput");
	if (filterInput) {
		let filterTimer = null;
		filterInput.addEventListener("input", () => {
			if (!window.ds.length) {
				return;
			}
			if (filterTimer) {
				window.clearTimeout(filterTimer);
			}
			filterTimer = window.setTimeout(() => {
				applyFilterSort();
			}, 120);
		});

		filterInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				applyFilterSort();
			}
		});
	}

	const sortSelect = document.getElementById("sortSelect");
	if (sortSelect) {
		sortSelect.addEventListener("change", () => {
			if (!window.ds.length) {
				return;
			}
			applyFilterSort();
		});
	}

	setupOpeningLoader();
	setupVisualizationModal();
	setStatus("Pick a dataset and generate your visual dashboard.");
});
