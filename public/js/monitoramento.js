document.addEventListener('DOMContentLoaded', () => {
    let allData = [];
    let currentReportData = [];
    let historyPage = 0;
    const historyItemsPerPage = 5;
    let motoristaChart, destinoChart, dataInicioChart;

    // --- Element Cache ---
    const textInput = document.getElementById('textInput');
    const generateBtn = document.getElementById('generateBtn');
    const dashboardContent = document.getElementById('dashboardContent');
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    const historyContainer = document.getElementById('historyContainer');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
    const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const printTableBtn = document.getElementById('printTableBtn');

    // --- Core Functions ---
    function processarTexto(texto, timestamp) {
        const linhas = texto.trim().split('\n');
        const dados = [];
        let i = 0;

        while (i < linhas.length) {
            let linha = linhas[i].trim();
            if (/.+ - \d+ - \d{2}\/\d{2}\/\d{4}/.test(linha)) {
                const motorista_nome = linha.split(" - ")[0].trim();
                i++;
                const veiculo = i < linhas.length ? linhas[i].trim() : "";
                i++;
                let ultima_conexao = "";
                if (i < linhas.length && linhas[i].includes("Última Conexão:")) {
                    ultima_conexao = linhas[i].split("Última Conexão:")[1].trim();
                    i++;
                }
                const entregas_line = i < linhas.length ? linhas[i].trim() : "";
                const entregas_split = entregas_line.split("\t");
                const entregas_realizadas = entregas_split.length >= 7 ? entregas_split[6].split("/")[0].trim() : "";
                const entregas_planejadas = entregas_split.length >= 7 ? entregas_split[6].split("/")[1].trim() : "";
                const peso_pendente = entregas_split.length >= 8 ? entregas_split[7].split("/")[0].trim() : "";
                const peso_total = entregas_split.length >= 8 ? entregas_split[7].split("/")[1].trim() : "";
                i++;
                let nf = "", codigo_erp = "", destino = "";
                if (i < linhas.length) {
                    const match_nf_erp = linhas[i].trim().match(/Nº\s+(\d+)\s*-\s*(\d+)/);
                    if (match_nf_erp) {
                        nf = match_nf_erp[1];
                        codigo_erp = match_nf_erp[2];
                        i++;
                        if (i < linhas.length) {
                            destino = linhas[i].trim();
                            i++;
                        }
                    }
                }
                let data_inicio_entrega = "";
                if (i < linhas.length) {
                    const proxima_linha = linhas[i].trim();
                    if (proxima_linha.startsWith("Data Inicio Entrega:")) {
                        data_inicio_entrega = proxima_linha.split("Data Inicio Entrega:")[1].trim();
                        i++;
                    } else if (proxima_linha.includes("Possui pendência") || proxima_linha.includes("Todas as entregas foram realizadas")) {
                        data_inicio_entrega = proxima_linha;
                        i++;
                    }
                }
                let percentual = "";
                if (i < linhas.length && /^\d+\s*%/.test(linhas[i].trim())) {
                    percentual = linhas[i].trim();
                    i++;
                }
                const filialMatch = destino.match(/\(([^)]+)\)/);
                const filial = filialMatch ? filialMatch[1] : 'N/A';
                if (codigo_erp) {
                    dados.push({
                        "Motorista": motorista_nome, "Veículo": veiculo, "Última Conexão": ultima_conexao,
                        "Entregas Realizadas": parseInt(entregas_realizadas) || 0, "Entregas Planejadas": parseInt(entregas_planejadas) || 0,
                        "Peso Pendente (kg)": parseInt(peso_pendente) || 0, "Peso Total (kg)": parseInt(peso_total) || 0,
                        "NF": nf, "codigoERP": codigo_erp, "Destino": destino, "Filial": filial,
                        "Data Início Entrega": data_inicio_entrega, "Percentual Concluído": percentual, "timestamp": timestamp,
                        "Previsão de Retorno": calcularPrevisaoRetorno(parseInt(entregas_planejadas) || 0, parseInt(entregas_realizadas) || 0)
                    });
                }
            } else { i++; }
        }
        return dados;
    }

    async function saveRelatorio(relatorio) {
        try {
            const db = await getDB();
            const transaction = db.transaction([STORES.monitoramento], "readwrite");
            const objectStore = transaction.objectStore(STORES.monitoramento);
            const promises = relatorio.data.map(record => new Promise((resolve, reject) => {
                const request = objectStore.add(record);
                request.onsuccess = resolve;
                request.onerror = reject;
            }));
            await Promise.all(promises);
            console.log("Todos os registros foram salvos.");
            historyPage = 0;
            await loadHistory();
            currentReportData = relatorio.data;
            displayDashboard(currentReportData, true);
        } catch (error) {
            console.error("Erro ao salvar registros:", error);
        }
    }

    async function loadHistory() {
        try {
            const db = await getDB();
            if (!historyContainer) return;
            historyContainer.innerHTML = '';
            const transaction = db.transaction([STORES.monitoramento, STORES.reportNames], "readonly");
            const monitoramentoStore = transaction.objectStore(STORES.monitoramento);
            const index = monitoramentoStore.index("timestamp");
            const request = index.getAll();
            request.onsuccess = async () => {
                allData = request.result;
                const allTimestamps = allData.map(r => r.timestamp.getTime());
                const uniqueTimestamps = [...new Set(allTimestamps)].sort((a, b) => b - a);
                const reportNames = await getAllReportNames(db);
                const totalPages = Math.ceil(uniqueTimestamps.length / historyItemsPerPage);
                const paginatedTimestamps = uniqueTimestamps.slice(historyPage * historyItemsPerPage, (historyPage * historyItemsPerPage) + historyItemsPerPage);
                paginatedTimestamps.forEach(ts => {
                    const date = new Date(ts);
                    const name = reportNames.find(n => n.timestamp === ts)?.name || date.toLocaleString('pt-BR');
                    const historyItemContainer = document.createElement('div');
                    historyItemContainer.className = 'flex items-center justify-between';

                    const checkboxId = `history-checkbox-${ts}`;
                    const historyItem = document.createElement('div');
                    historyItem.className = 'flex-grow';
                    historyItem.innerHTML = `
                        <input id="${checkboxId}" type="checkbox" value="${ts}" class="custom-checkbox mr-2">
                        <label for="${checkboxId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">${name}</label>
                    `;

                    const editBtn = document.createElement('button');
                    editBtn.className = 'p-2 text-gray-500 hover:text-blue-600';
                    editBtn.innerHTML = '<i class="fas fa-clipboard"></i>';
                    editBtn.onclick = () => {
                        const newName = prompt("Digite o novo nome para o relatório:", name);
                        if (newName) saveReportName(ts, newName);
                    };

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'p-2 text-gray-500 hover:text-red-600';
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    deleteBtn.onclick = () => {
                        if (confirm(`Tem certeza que deseja excluir o relatório "${name}"?`)) deleteReport(date);
                    };

                    historyItemContainer.appendChild(historyItem);
                    historyItemContainer.appendChild(editBtn);
                    historyItemContainer.appendChild(deleteBtn);
                    historyContainer.appendChild(historyItemContainer);
                });
                updateHistoryPaginationControls(uniqueTimestamps.length, totalPages);
            };
        } catch (error) {
            console.error("Falha ao carregar histórico:", error);
        }
    }


    function getAllReportNames(db) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.reportNames], "readonly");
            const request = transaction.objectStore(STORES.reportNames).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveReportName(timestamp, name) {
        try {
            const db = await getDB();
            const transaction = db.transaction([STORES.reportNames], "readwrite");
            transaction.objectStore(STORES.reportNames).put({ timestamp, name });
            await loadHistory();
        } catch (error) {
            console.error("Falha ao salvar nome do relatório:", error);
        }
    }

    async function deleteReport(timestamp) {
        try {
            const db = await getDB();
            const monitoramentoTx = db.transaction([STORES.monitoramento], "readwrite");
            const index = monitoramentoTx.objectStore(STORES.monitoramento).index("timestamp");
            const request = index.openCursor(IDBKeyRange.only(timestamp));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            await new Promise(resolve => monitoramentoTx.oncomplete = resolve);
            const namesTx = db.transaction([STORES.reportNames], "readwrite");
            namesTx.objectStore(STORES.reportNames).delete(timestamp.getTime());
            await new Promise(resolve => namesTx.oncomplete = resolve);
            await loadHistory();
            if (dashboardContent) dashboardContent.classList.add('hidden');
        } catch (error) {
            console.error("Falha ao deletar relatório:", error);
        }
    }

    function populateFilters(data) {
       const filtersContainer = document.getElementById('filtersContainer');
       if (!filtersContainer) return;
       filtersContainer.innerHTML = '';
       const filters = {'Motorista': 'motorista', 'Veículo': 'veiculo', 'Data Início Entrega': 'dataInicio', 'Percentual Concluído': 'percentual', 'Previsão de Retorno': 'previsao'};
       Object.entries(filters).forEach(([label, idPrefix]) => {
           const options = [...new Set(data.map(item => (label === 'Data Início Entrega' ? item[label].split(' ')[0] : item[label])).filter(Boolean))].sort();
           filtersContainer.innerHTML += `
               <div class="relative">
                   <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">${label}</label>
                   <button id="${idPrefix}FilterBtn" class="w-full bg-white dark:bg-gray-700 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                       <span id="${idPrefix}FilterText" class="truncate">Todos</span><i class="fas fa-chevron-down text-gray-400"></i>
                   </button>
                   <div id="${idPrefix}FilterDropdown" class="hidden absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                       <div class="p-2"><input type="text" id="${idPrefix}Search" placeholder="Buscar..." class="w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-sm"></div>
                       <div id="${idPrefix}FilterOptions" class="dropdown-checkbox-menu p-2 space-y-1"></div>
                   </div>
               </div>`;
           populateMultiSelect(options, `${idPrefix}FilterOptions`, idPrefix);
           setupFilterInteractions(idPrefix);
       });
   }

   function populateMultiSelect(options, containerId, prefix) {
       const container = document.getElementById(containerId);
       if (!container) return;
       container.innerHTML = '';
       const slugify = (text) => String(text).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
       options.forEach((option, index) => {
           const div = document.createElement('div');
           div.className = 'flex items-center';
           const safeId = `${prefix}-${slugify(option)}-${index}`;
           div.innerHTML = `<input id="${safeId}" type="checkbox" value="${option}" class="custom-checkbox mr-2"><label for="${safeId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">${option}</label>`;
           container.appendChild(div);
       });
   }

   function setupFilterInteractions(idPrefix) {
       const btn = document.getElementById(`${idPrefix}FilterBtn`);
       const dropdown = document.getElementById(`${idPrefix}FilterDropdown`);
       const search = document.getElementById(`${idPrefix}Search`);
       const options = document.getElementById(`${idPrefix}FilterOptions`);
       const text = document.getElementById(`${idPrefix}FilterText`);
       if (!btn) return;
       btn.addEventListener('click', (e) => {
           e.stopPropagation();
           closeAllDropdowns();
           if (dropdown) dropdown.classList.toggle('hidden');
       });
       if (search) search.addEventListener('input', () => {
           const filter = search.value.toLowerCase();
           if (options) options.querySelectorAll('label').forEach(label => {
               label.parentElement.style.display = label.textContent.toLowerCase().includes(filter) ? '' : 'none';
           });
       });
       if (options) options.addEventListener('change', () => {
           const selected = Array.from(options.querySelectorAll('input:checked')).map(cb => cb.value);
           if (text) {
               if (selected.length === 0) text.textContent = 'Todos';
               else if (selected.length === 1) text.textContent = selected[0];
               else text.textContent = `${selected.length} selecionados`;
           }
       });
   }

   function closeAllDropdowns() {
       document.querySelectorAll('[id$="FilterDropdown"]').forEach(d => d.classList.add('hidden'));
   }

    function displayDashboard(data, repopulate) {
        if (!dashboardContent) return;
        renderTable(data);
        renderCharts(data);
        if (repopulate) populateFilters(currentReportData);
        dashboardContent.classList.remove('hidden');
    }

    function renderTable(data) {
        if (!tableHeader || !tableBody) return;
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';
        if (data.length === 0) return;
        const headers = Object.keys(data[0]).filter(h => h !== 'timestamp');
        const headerRow = document.createElement('tr');
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.className = "px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider";
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        tableHeader.appendChild(headerRow);
        data.forEach(rowData => {
            const row = document.createElement('tr');
            headers.forEach(header => {
                const cell = document.createElement('td');
                cell.className = "px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300";
                cell.textContent = rowData[header];
                row.appendChild(cell);
            });
            tableBody.appendChild(row);
        });
    }

    function renderCharts(data) {
        const getChartColors = () => ({
            fontColor: document.documentElement.classList.contains('dark') ? '#E5E7EB' : '#111827',
            gridColor: document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
        });
        const chartOptions = (extraOptions = {}) => ({
            responsive: true, maintainAspectRatio: false,
            scales: { y: { ticks: { color: getChartColors().fontColor }, grid: { color: getChartColors().gridColor } }, x: { ticks: { color: getChartColors().fontColor } } },
            plugins: { legend: { labels: { color: getChartColors().fontColor } } }, ...extraOptions
        });
        const pieChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getChartColors().fontColor } } } };

        const motoristaCtx = document.getElementById('motoristaChart');
        if (motoristaCtx) {
            const motoristas = data.reduce((acc, row) => { acc[row.Motorista] = (acc[row.Motorista] || 0) + row['Entregas Realizadas']; return acc; }, {});
            if (motoristaChart) motoristaChart.destroy();
            motoristaChart = new Chart(motoristaCtx.getContext('2d'), { type: 'bar', data: { labels: Object.keys(motoristas), datasets: [{ label: 'Entregas Realizadas', data: Object.values(motoristas), backgroundColor: 'rgba(216, 13, 13, 0.7)' }] }, options: chartOptions() });
        }

        const destinoCtx = document.getElementById('destinoChart');
        if (destinoCtx) {
            const destinos = data.reduce((acc, row) => { acc[row.Destino] = (acc[row.Destino] || 0) + row['Entregas Planejadas']; return acc; }, {});
            if (destinoChart) destinoChart.destroy();
            destinoChart = new Chart(destinoCtx.getContext('2d'), { type: 'pie', data: { labels: Object.keys(destinos), datasets: [{ data: Object.values(destinos), backgroundColor: ['#D80D0D', '#1E3A8A', '#065F46', '#5B21B6', '#9D174D', '#F59E0B'] }] }, options: pieChartOptions });
        }

        const dataInicioCtx = document.getElementById('dataInicioChart');
        if (dataInicioCtx) {
            const datasInicio = data.reduce((acc, row) => {
                let dataInicio = row['Data Início Entrega']?.includes('/') ? row['Data Início Entrega'].split(' ')[0] : "Sem Data";
                acc[dataInicio] = (acc[dataInicio] || 0) + row['Entregas Planejadas'];
                return acc;
            }, {});
            if (dataInicioChart) dataInicioChart.destroy();
            dataInicioChart = new Chart(dataInicioCtx.getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(datasInicio), datasets: [{ data: Object.values(datasInicio), backgroundColor: ['#059669', '#D97706', '#9333EA', '#DB2777', '#6D28D9', '#FBBF24'] }] }, options: pieChartOptions });
        }
    }

    function calcularPrevisaoRetorno(planejadas, realizadas) {
        const entregas_pendentes = planejadas - realizadas;
        let data_estimada = new Date();
        if (planejadas > 0 && entregas_pendentes >= 10) {
            let dias = Math.ceil(entregas_pendentes / (planejadas <= 30 ? 13 : 10));
            data_estimada.setDate(data_estimada.getDate() + dias);
            if (data_estimada.getDay() === 0) data_estimada.setDate(data_estimada.getDate() - 1);
        }
        return data_estimada.toLocaleDateString('pt-BR');
    }

   function updateHistoryPaginationControls(totalItems, totalPages) {
       const els = {
           summary: document.getElementById('historyPaginationSummary'),
           prevMobile: document.getElementById('historyPrevBtnMobile'),
           nextMobile: document.getElementById('historyNextBtnMobile'),
           prevDesktop: document.getElementById('historyPrevBtnDesktop'),
           nextDesktop: document.getElementById('historyNextBtnDesktop'),
           links: document.getElementById('historyPaginationLinks')
       };
       if (Object.values(els).some(el => !el)) return;

       const startItem = totalItems > 0 ? (historyPage * historyItemsPerPage) + 1 : 0;
       const endItem = Math.min((historyPage + 1) * historyItemsPerPage, totalItems);
       els.summary.innerHTML = `Mostrando <span class="font-medium">${startItem}</span> a <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> resultados`;

       const hasPrev = historyPage > 0;
       const hasNext = historyPage < totalPages - 1;
       [els.prevMobile, els.prevDesktop].forEach(btn => btn.disabled = !hasPrev);
       [els.nextMobile, els.nextDesktop].forEach(btn => btn.disabled = !hasNext);

       els.links.innerHTML = '';
       const createPageButton = (page) => {
           const button = document.createElement('button');
           button.textContent = page + 1;
           button.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === historyPage ? 'z-10 bg-primary border-primary text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`;
           button.addEventListener('click', () => { historyPage = page; loadHistory(); });
           return button;
       };
       const createEllipsis = () => {
           const span = document.createElement('span');
           span.textContent = '...';
           span.className = 'relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300';
           return span;
       };

       if (totalPages <= 7) {
           for (let i = 0; i < totalPages; i++) els.links.appendChild(createPageButton(i));
       } else {
           els.links.appendChild(createPageButton(0));
           if (historyPage > 2) els.links.appendChild(createEllipsis());
           let startPage = Math.max(1, historyPage - 1);
           let endPage = Math.min(totalPages - 2, historyPage + 1);
           if (historyPage <= 2) endPage = 3;
           if (historyPage >= totalPages - 3) startPage = totalPages - 4;
           for (let i = startPage; i <= endPage; i++) els.links.appendChild(createPageButton(i));
           if (historyPage < totalPages - 3) els.links.appendChild(createEllipsis());
           els.links.appendChild(createPageButton(totalPages - 1));
       }
   }

    // --- Event Listeners Setup ---
    if (generateBtn) generateBtn.addEventListener('click', () => {
        if (textInput.value.trim()) {
            const timestamp = new Date();
            const dados = processarTexto(textInput.value, timestamp);
            saveRelatorio({ timestamp, data: dados });
            textInput.value = '';
        } else {
            alert("Por favor, cole o texto antes de gerar o relatório.");
        }
    });

    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', async () => {
        const getSelectedOptions = (filterId) => Array.from(document.querySelectorAll(`#${filterId} input[type="checkbox"]:checked`)).map(cb => cb.value);
        
        const selectedTimestamps = getSelectedOptions('historyContainer').map(ts => parseInt(ts, 10));

        if (selectedTimestamps.length === 0) {
            alert("Por favor, selecione pelo menos um período.");
            return;
        }

        try {
            const db = await getDB();
            const transaction = db.transaction([STORES.monitoramento], "readonly");
            const store = transaction.objectStore(STORES.monitoramento);
            const index = store.index("timestamp");

            const promises = selectedTimestamps.map(ts => {
                return new Promise((resolve, reject) => {
                    const request = index.getAll(IDBKeyRange.only(new Date(ts)));
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            });

            const results = await Promise.all(promises);
            currentReportData = results.flat();
            
            const selectedMotoristas = getSelectedOptions('motoristaFilterOptions');
            const selectedVeiculos = getSelectedOptions('veiculoFilterOptions');
            const selectedDatas = getSelectedOptions('dataInicioFilterOptions');
            const selectedPercentuais = getSelectedOptions('percentualFilterOptions');
            const selectedPrevisoes = getSelectedOptions('previsaoFilterOptions');

            const filteredData = currentReportData.filter(row =>
                (selectedMotoristas.length === 0 || selectedMotoristas.includes(row['Motorista'])) &&
                (selectedVeiculos.length === 0 || selectedVeiculos.includes(row['Veículo'])) &&
                (selectedDatas.length === 0 || selectedDatas.includes(row['Data Início Entrega'].split(' ')[0])) &&
                (selectedPercentuais.length === 0 || selectedPercentuais.includes(row['Percentual Concluído'])) &&
                (selectedPrevisoes.length === 0 || selectedPrevisoes.includes(row['Previsão de Retorno']))
            );
            
            displayDashboard(filteredData, true);

        } catch (error) {
            console.error("Falha ao carregar dados do relatório:", error);
        }
    });

    if (printTableBtn) printTableBtn.addEventListener('click', () => {
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Imprimir Tabela</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background-color:#f2f2f2}</style></head><body>');
        printWindow.document.write('<h1>Dados do Monitoramento</h1>');
        const tableContent = document.querySelector('.overflow-x-auto');
        if(tableContent) printWindow.document.write(tableContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    });

    document.addEventListener('click', (e) => {
        const prevBtn = e.target.closest('#historyPrevBtnMobile, #historyPrevBtnDesktop');
        if (prevBtn && !prevBtn.disabled && historyPage > 0) {
            historyPage--;
            loadHistory();
        }
        const nextBtn = e.target.closest('#historyNextBtnMobile, #historyNextBtnDesktop');
        if (nextBtn && !nextBtn.disabled) {
            const totalPages = Math.ceil(allData.map(r => r.timestamp.getTime()).filter((v, i, a) => a.indexOf(v) === i).length / historyItemsPerPage);
            if (historyPage < totalPages - 1) {
                historyPage++;
                loadHistory();
            }
        }
        if (!e.target.closest('[id$="FilterBtn"]')) {
            closeAllDropdowns();
        }
    });

    if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('collapsed');
        });
    }

    if (themeToggleBtn && themeToggleDarkIcon && themeToggleLightIcon) {
        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
                themeToggleLightIcon.classList.remove('hidden');
                themeToggleDarkIcon.classList.add('hidden');
            } else {
                document.documentElement.classList.remove('dark');
                themeToggleDarkIcon.classList.remove('hidden');
                themeToggleLightIcon.classList.add('hidden');
            }
        };
        const preferredTheme = localStorage.getItem('color-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(preferredTheme);
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('color-theme', newTheme);
            applyTheme(newTheme);
        });
    }

    // --- Initial Load ---
    loadHistory();
});