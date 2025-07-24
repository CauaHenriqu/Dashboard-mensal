const DB_NAME = "DashboardDB";
const DB_VERSION = 7;
const STORES = {
    entregas: "entregas",
    monitoramento: "monitoramento",
    reportNames: "report_names",
    deliveryReportNames: "delivery_report_names",
    users: "users",
    sessions: "sessions"
};

let dbPromise = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Database error:", event.target.errorCode);
                reject("Database error: " + event.target.errorCode);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (db.objectStoreNames.contains(STORES.entregas)) {
                    const entregasStore = event.target.transaction.objectStore(STORES.entregas);
                    if (!entregasStore.indexNames.contains("timestamp")) {
                        entregasStore.createIndex("timestamp", "timestamp", { unique: false });
                    }
                } else {
                    const entregasStore = db.createObjectStore(STORES.entregas, { keyPath: "cargaERP" });
                    entregasStore.createIndex("timestamp", "timestamp", { unique: false });
                }

                if (db.objectStoreNames.contains(STORES.monitoramento)) {
                   const monitoramentoStore = event.target.transaction.objectStore(STORES.monitoramento);
                   if (!monitoramentoStore.indexNames.contains("codigoERP")) {
                       monitoramentoStore.createIndex("codigoERP", "codigoERP", { unique: false });
                   }
                   if (!monitoramentoStore.indexNames.contains("timestamp")) {
                       monitoramentoStore.createIndex("timestamp", "timestamp", { unique: false });
                   }
                } else {
                    const monitoramentoStore = db.createObjectStore(STORES.monitoramento, { autoIncrement: true });
                    monitoramentoStore.createIndex("codigoERP", "codigoERP", { unique: false });
                    monitoramentoStore.createIndex("timestamp", "timestamp", { unique: false });
                }

                if (!db.objectStoreNames.contains(STORES.reportNames)) {
                    db.createObjectStore(STORES.reportNames, { keyPath: "timestamp" });
                }

                if (!db.objectStoreNames.contains(STORES.deliveryReportNames)) {
                    db.createObjectStore(STORES.deliveryReportNames, { keyPath: "timestamp" });
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                resolve(db);
            };
        });
    }
    return dbPromise;
}

function deleteDB() {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
            console.log("Database deleted successfully.");
            dbPromise = null; // Reset
            resolve();
        };
        deleteRequest.onerror = (event) => {
            console.error("Error deleting database:", event.target.errorCode);
            reject("Error deleting database: " + event.target.errorCode);
        };
        deleteRequest.onblocked = () => {
            console.warn("Database deletion blocked. Please close other tabs with this app open.");
            alert("Não foi possível excluir o banco de dados. Feche outras abas com esta aplicação aberta e tente novamente.");
            reject("Deletion blocked");
        };
    });
}
