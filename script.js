const KAGGLE_DATASET_SLUG = "zynicide/wine-reviews";
const LOCAL_KAGGLE_EXPORT_PATH = "./data/winemag-data-130k-v2.csv";
const MIRROR_CSV_URL =
	"https://raw.githubusercontent.com/plotly/datasets/master/winemag-data-130k-v2.csv";

window.ds = [];

function setStatus(message, isError = false) {
	const statusElement = document.getElementById("status");
	if (!statusElement) {
		return;
	}
	statusElement.textContent = message;
	statusElement.style.color = isError ? "#8f1222" : "inherit";
}

function parseCsv(url) {
	return new Promise((resolve, reject) => {
		Papa.parse(url, {
			download: true,
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
}

async function loadDataset() {
	const button = document.getElementById("loadButton");
	if (button) {
		button.disabled = true;
	}

	try {
		setStatus("Loading dataset from local Kaggle export...");
		let data;

		try {
			data = await parseCsv(LOCAL_KAGGLE_EXPORT_PATH);
			setStatus(`Loaded ${data.length.toLocaleString()} rows from local file.`);
		} catch (localError) {
			setStatus("Local CSV not found. Falling back to public mirror...");
			data = await parseCsv(MIRROR_CSV_URL);
			setStatus(
				`Loaded ${data.length.toLocaleString()} rows from mirror (${KAGGLE_DATASET_SLUG}).`
			);
		}

		window.ds = data;
		window.dispatchEvent(new CustomEvent("dataset:loaded", { detail: { size: data.length } }));
	} catch (error) {
		console.error("Failed to load dataset:", error);
		setStatus(`Failed to load dataset: ${error.message}`, true);
		window.ds = [];
	} finally {
		if (button) {
			button.disabled = false;
		}
	}
}

window.loadDataset = loadDataset;

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("loadButton");
	if (button) {
		button.addEventListener("click", loadDataset);
	}
	setStatus(`Dataset ready to import from Kaggle: ${KAGGLE_DATASET_SLUG}`);
});
