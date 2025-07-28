document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let originalData = [];
    let currentTableData = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let sortState = { column: 'cargaERP', direction: 'asc' };
    let historyPage = 0;
    const historyItemsPerPage = 5;
    let lastTotalValor = 0;
    let isValorVisible = false;

    // --- Element Cache ---
    const deliveriesCtx = document.getElementById('deliveriesChart')?.getContext('2d');
    const volumeCtx = document.getElementById('volumeChart')?.getContext('2d');
    const valueCtx = document.getElementById('valueChart')?.getContext('2d');
    const helpersCtx = document.getElementById('helpersChart')?.getContext('2d');
    const filialCtx = document.getElementById('filialChart')?.getContext('2d');
    const loadingText = document.getElementById('loadingText');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const importBtn = document.getElementById('importBtn');
    const fileInput = document.getElementById('fileInput');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const totalEntregasEl = document.getElementById('totalEntregas');
    const totalPedidosEl = document.getElementById('totalPedidos');
    const totalPesoEl = document.getElementById('totalPeso');
    const totalValorEl = document.getElementById('totalValor');
    const toggleValorIconEl = document.getElementById('toggleValorIcon');
    const tableBody = document.getElementById('dataTableBody');
    const passwordModal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const detailsModal = document.getElementById('detailsModal');
    const clearDbBtn = document.getElementById('clearDbBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const backToTopButton = document.getElementById('backToTop');
    const exportDataBtn = document.getElementById('exportDataBtn');

    // --- Chart Instances ---
    let deliveriesChart, volumeChart, valueChart, helpersChart, filialChart;

    const getChartFontColor = () => document.documentElement.classList.contains('dark') ? '#E5E7EB' : '#111827';
    const getChartGridColor = () => document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    const commonChartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: getChartFontColor(), font: { size: 10 } } } },
        scales: {
            y: { beginAtZero: true, ticks: { color: getChartFontColor(), font: { size: 10 } }, grid: { color: getChartGridColor() } },
            x: { ticks: { color: getChartFontColor(), font: { size: 10 } }, grid: { display: false } }
        }
    };

    if (deliveriesCtx) deliveriesChart = new Chart(deliveriesCtx, { type: 'bar', data: { labels: [], datasets: [{ label: 'Entregas', data: [], backgroundColor: 'rgba(216, 13, 13, 0.7)', borderColor: 'rgba(216, 13, 13, 1)', borderWidth: 1 }] }, options: { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, legend: { display: false } } } });
    if (volumeCtx) volumeChart = new Chart(volumeCtx, { type: 'doughnut', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#D80D0D', '#1E3A8A', '#065F46', '#5B21B6', '#9D174D'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getChartFontColor(), font: { size: 10 } } } }, cutout: '70%' } });
    if (valueCtx) valueChart = new Chart(valueCtx, { type: 'pie', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#F59E0B', '#10B981', '#3B82F6', '#D80D0D'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getChartFontColor(), font: { size: 10 } } } } } });
    if (helpersCtx) helpersChart = new Chart(helpersCtx, { type: 'bar', data: { labels: [], datasets: [{ label: 'Chamados', data: [], backgroundColor: 'rgba(2, 132, 199, 0.7)', borderColor: 'rgba(2, 132, 199, 1)', borderWidth: 1 }] }, options: { ...commonChartOptions, plugins: { ...commonChartOptions.plugins, legend: { display: false } } } });
    if (filialCtx) filialChart = new Chart(filialCtx, { type: 'pie', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#D80D0D', '#1E3A8A', '#065F46', '#5B21B6', '#9D174D', '#F59E0B', '#10B981'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getChartFontColor(), font: { size: 10 } } } } } });

    // --- Utility Functions ---
    const showLoading = (text) => { if (loadingOverlay) { loadingText.textContent = text; loadingOverlay.classList.remove('hidden'); } };
    const hideLoading = () => { if (loadingOverlay) loadingOverlay.classList.add('hidden'); };
    const parseFormattedNumber = (value) => {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string' || !value) return 0;
        let cleanedValue = String(value).replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
        const number = parseFloat(cleanedValue);
        return isNaN(number) ? 0 : number;
    };

    // --- Core Application Logic ---
    async function processDataInChunks(jsonData) {
        const db = await getDB();
        if (jsonData.length < 2) { hideLoading(); return; }
        const headerRow = jsonData[0].map(h => typeof h === 'string' ? h.trim() : h);
        const dataRows = jsonData.slice(1);
        const headerMapping = { 'CARGA ERP': 'cargaERP', 'ENTREGAS': 'entregas', 'PEDIDOS': 'pedidos', 'PESO (KG)': 'pesoKG', 'VOLUME (M3)': 'volumeM3', 'VALOR (R$)': 'valorRS', 'DESTINO': 'destino', 'MOTORISTA': 'motorista', 'VEICULO': 'veiculo', 'AJUDANTE 1': 'ajudante1', 'FILIAL EXPEDICAO': 'filialExpedicao' };
        const requiredHeaders = Object.keys(headerMapping);
        const headerIndexes = requiredHeaders.map(h => headerRow.indexOf(h));
        if (headerIndexes.some(index => index === -1)) {
            alert(`Colunas não encontradas: ${requiredHeaders.filter((h, i) => headerIndexes[i] === -1).join(', ')}`);
            hideLoading(); return;
        }
        const transaction = db.transaction([STORES.entregas], "readwrite");
        const store = transaction.objectStore(STORES.entregas);
        const timestamp = new Date();
        const promises = dataRows.map((row, i) => {
            let obj = { timestamp };
            requiredHeaders.forEach((header, j) => { obj[headerMapping[header]] = (headerIndexes[j] !== -1) ? row[headerIndexes[j]] : undefined; });
            if (obj.cargaERP) {
                showLoading(`Processando ${i + 1} de ${dataRows.length} linhas...`);
                return new Promise((resolve, reject) => {
                    const request = store.put(obj);
                    request.onsuccess = resolve;
                    request.onerror = reject;
                });
            }
            return Promise.resolve();
        });
        await Promise.all(promises);
        showLoading('Atualizando o dashboard...');
        await loadInitialData();
        hideLoading();
    }

    async function loadInitialData() {
        try {
            const db = await getDB();
            const request = db.transaction([STORES.entregas], "readonly").objectStore(STORES.entregas).getAll();
            request.onsuccess = () => {
                originalData = request.result;
                currentTableData = [...originalData];
                updateDashboard(currentTableData);
                loadDeliveryHistory();
            };
        } catch (error) { console.error("Falha ao carregar dados iniciais:", error); }
    }

    function updateDashboard(data) {
        updateSummaryCards(data);
        populateFilters(originalData);
        renderTable();
        updateCharts(data);
    }

    function updateSummaryCards(data) {
        if (!totalEntregasEl || !totalPedidosEl || !totalPesoEl) return;
        totalEntregasEl.textContent = data.reduce((sum, row) => sum + (Number(row.entregas) || 0), 0).toLocaleString('pt-BR');
        totalPedidosEl.textContent = data.reduce((sum, row) => sum + (Number(row.pedidos) || 0), 0).toLocaleString('pt-BR');
        totalPesoEl.textContent = data.reduce((sum, row) => sum + parseFormattedNumber(row.pesoKG), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' KG';
        lastTotalValor = data.reduce((sum, row) => sum + parseFormattedNumber(row.valorRS), 0);
        updateValorDisplay();
    }

    function populateFilters(data) {
        const createOptions = (key) => [...new Set(data.map(item => item[key]).filter(Boolean))].sort();
        populateMultiSelect(createOptions('motorista'), 'motoristaFilterOptions', 'motorista');
        populateMultiSelect(createOptions('destino'), 'destinoFilterOptions', 'dest');
        populateMultiSelect(createOptions('veiculo'), 'veiculoFilterOptions', 'veiculo');
        populateMultiSelect(createOptions('ajudante1'), 'ajudanteFilterOptions', 'ajudante');
        populateMultiSelect(createOptions('filialExpedicao'), 'filialFilterOptions', 'filial');
    }

    function populateMultiSelect(options, containerId, prefix) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const currentSelected = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
        container.innerHTML = '';
        const slugify = (text) => String(text).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
        options.forEach((option, index) => {
            const div = document.createElement('div');
            div.className = 'flex items-center';
            const isChecked = currentSelected.includes(option);
            const safeId = `${prefix}-${slugify(option)}-${index}`;
            div.innerHTML = `<input id="${safeId}" type="checkbox" value="${option}" class="custom-checkbox mr-2" ${isChecked ? 'checked' : ''}><label for="${safeId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">${option}</label>`;
            container.appendChild(div);
        });
    }

    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const sortedData = [...currentTableData].sort((a, b) => {
            const valA = a[sortState.column], valB = b[sortState.column];
            const numA = parseFormattedNumber(valA), numB = parseFormattedNumber(valB);
            let comparison = (!isNaN(numA) && !isNaN(numB)) ? numA - numB : String(valA).localeCompare(String(valB));
            return sortState.direction === 'asc' ? comparison : -comparison;
        });
        const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        if (paginatedData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-gray-500 dark:text-gray-400">Nenhum dado para exibir.</td></tr>';
        } else {
            paginatedData.forEach(row => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700';
                tr.dataset.cargaErp = row.cargaERP;
                tr.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary" data-field="cargaERP">${row.cargaERP || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="entregas">${row.entregas || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="pedidos">${row.pedidos || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="pesoKG">${parseFormattedNumber(row.pesoKG).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="volumeM3">${parseFormattedNumber(row.volumeM3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="valorRS">${parseFormattedNumber(row.valorRS).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="destino">${row.destino || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="motorista">${row.motorista || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="veiculo">${row.veiculo || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300" data-field="ajudante1">${row.ajudante1 || ''}</td>
                    <td class="sticky right-0 bg-white dark:bg-gray-800 px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="view-btn text-primary hover:text-red-700 mr-3"><i class="fas fa-eye"></i></button>
                        <button class="edit-btn text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                    </td>`;
                tableBody.appendChild(tr);
            });
        }
        updatePaginationControls();
    }

    function updateValorDisplay() {
        if (!totalValorEl || !toggleValorIconEl) return;
        if (isValorVisible) {
            totalValorEl.textContent = lastTotalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            toggleValorIconEl.className = 'fas fa-eye-slash';
        } else {
            totalValorEl.textContent = 'R$ ●●●●●';
            toggleValorIconEl.className = 'fas fa-eye';
        }
    }

    function updateCharts(data) {
        if (deliveriesChart) {
            const entregasPorMotorista = data.reduce((acc, row) => {
                if (row.motorista) acc[row.motorista] = (acc[row.motorista] || 0) + (Number(row.entregas) || 0);
                return acc;
            }, {});

            // Obtenha os pares [motorista, entregas], ordene pelo valor (entregas)
            const motoristasOrdenados = Object.entries(entregasPorMotorista)
                .sort((a, b) => a[1] - b[1]); // crescente

            // Atualize os dados do gráfico
            deliveriesChart.data.labels = motoristasOrdenados.map(item => item[0]);
            deliveriesChart.data.datasets[0].data = motoristasOrdenados.map(item => item[1]);

            // Atualize as cores conforme o tema atual
            const fontColor = document.documentElement.classList.contains('dark') ? '#ffffffff' : '#000000ff';
            deliveriesChart.options.plugins.legend.labels.color = fontColor;
            deliveriesChart.options.scales.x.ticks.color = fontColor;
            deliveriesChart.options.scales.y.ticks.color = fontColor;

            deliveriesChart.update();

        }
        if (volumeChart) {
            const volumePorDestino = data.reduce((acc, row) => { if (row.destino) acc[row.destino] = (acc[row.destino] || 0) + parseFormattedNumber(row.volumeM3); return acc; }, {});
            volumeChart.data.labels = Object.keys(volumePorDestino);
            volumeChart.data.datasets[0].data = Object.values(volumePorDestino);
            volumeChart.update();
        }
        if (valueChart) {
            const valorPorFaixa = data.reduce((acc, row) => { const valor = parseFormattedNumber(row.valorRS); if (valor < 5000) acc['< R$5k']++; else if (valor < 10000) acc['R$5k-R$10k']++; else if (valor < 15000) acc['R$10k-R$15k']++; else acc['> R$15k']++; return acc; }, { '< R$5k': 0, 'R$5k-R$10k': 0, 'R$10k-R$15k': 0, '> R$15k': 0 });
            valueChart.data.labels = Object.keys(valorPorFaixa);
            valueChart.data.datasets[0].data = Object.values(valorPorFaixa);
            valueChart.update();
        }
        if (helpersChart) {
            const chamadosPorAjudante = data.reduce((acc, row) => {
                if (row.ajudante1) acc[row.ajudante1] = (acc[row.ajudante1] || 0) + 1;
                return acc;
            }, {});

            // Ordena ajudantes pelo número de chamados (crescente)
            const ajudantesOrdenados = Object.entries(chamadosPorAjudante)
                .sort((a, b) => a[1] - b[1]); // crescente

            helpersChart.data.labels = ajudantesOrdenados.map(item => item[0]);
            helpersChart.data.datasets[0].data = ajudantesOrdenados.map(item => item[1]);
            helpersChart.update();
        }
        if (filialChart) {
            const entregasPorFilial = data.reduce((acc, row) => { if (row.filialExpedicao) acc[row.filialExpedicao] = (acc[row.filialExpedicao] || 0) + (Number(row.entregas) || 0); return acc; }, {});
            filialChart.data.labels = Object.keys(entregasPorFilial);
            filialChart.data.datasets[0].data = Object.values(entregasPorFilial);
            filialChart.update();
        }
    }

    function setupFilterInteractions() {
        const setupMultiSelect = (prefix) => {
            const btn = document.getElementById(`${prefix}FilterBtn`);
            const dropdown = document.getElementById(`${prefix}FilterDropdown`);
            const search = document.getElementById(`${prefix}Search`);
            const options = document.getElementById(`${prefix}FilterOptions`);
            const text = document.getElementById(`${prefix}FilterText`);
            if (!btn || !dropdown || !search || !options || !text) return;
            btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); });
            search.addEventListener('input', () => {
                const filter = search.value.toLowerCase();
                options.querySelectorAll('label').forEach(label => { label.parentElement.style.display = label.textContent.toLowerCase().includes(filter) ? '' : 'none'; });
            });
            options.addEventListener('change', () => {
                const selected = Array.from(options.querySelectorAll('input:checked')).map(cb => cb.value);
                if (selected.length === 0) text.textContent = 'Todos';
                else if (selected.length === 1) text.textContent = selected[0];
                else text.textContent = `${selected.length} selecionados`;
            });
        };
        ['motorista', 'destino', 'veiculo', 'ajudante', 'filial'].forEach(setupMultiSelect);
        document.addEventListener('click', () => document.querySelectorAll('[id$="FilterDropdown"]').forEach(d => d.classList.add('hidden')));
        document.querySelectorAll('[id$="FilterDropdown"]').forEach(d => d.addEventListener('click', e => e.stopPropagation()));
        const chartToggles = { 'showHelperChart': 'helpersChartContainer', 'showVolumeChart': 'volumeChartContainer', 'showValueChart': 'valueChartContainer', 'showFilialChart': 'filialChartContainer' };
        Object.entries(chartToggles).forEach(([checkboxId, containerId]) => {
            const checkbox = document.getElementById(checkboxId);
            const container = document.getElementById(containerId);
            if (checkbox && container) checkbox.addEventListener('change', (e) => {
                container.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked) {
                    container.classList.add('animate-zoom-in');
                    setTimeout(() => container.classList.remove('animate-zoom-in'), 500);
                }
                const visibleCharts = Object.values(chartToggles).map(id => document.getElementById(id)).filter(c => c && !c.classList.contains('hidden'));
                visibleCharts.forEach(c => c.classList.remove('lg:col-span-2'));
                if (visibleCharts.length === 1) visibleCharts[0].classList.add('lg:col-span-2');
            });
        });
    }

    function updatePaginationControls() {
        const totalItems = currentTableData.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const els = { summary: document.getElementById('paginationSummary'), prevMobile: document.getElementById('prevPageBtnMobile'), nextMobile: document.getElementById('nextPageBtnMobile'), prevDesktop: document.getElementById('prevPageBtnDesktop'), nextDesktop: document.getElementById('nextPageBtnDesktop'), links: document.getElementById('paginationLinks') };
        if (Object.values(els).some(el => !el)) return;
        const startItem = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
        const endItem = Math.min(currentPage * itemsPerPage, totalItems);
        els.summary.innerHTML = `Mostrando <span class="font-medium">${startItem}</span> a <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> resultados`;
        const hasPrev = currentPage > 1, hasNext = currentPage < totalPages;
        [els.prevMobile, els.prevDesktop].forEach(btn => btn.disabled = !hasPrev);
        [els.nextMobile, els.nextDesktop].forEach(btn => btn.disabled = !hasNext);
        els.links.innerHTML = '';
        const createPageButton = (page) => {
            const button = document.createElement('button');
            button.textContent = page;
            button.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === currentPage ? 'z-10 bg-primary border-primary text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`;
            button.addEventListener('click', () => { currentPage = page; renderTable(); });
            return button;
        };
        const createEllipsis = () => { const span = document.createElement('span'); span.textContent = '...'; span.className = 'relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300'; return span; };
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) els.links.appendChild(createPageButton(i));
        } else {
            els.links.appendChild(createPageButton(1));
            if (currentPage > 3) els.links.appendChild(createEllipsis());
            let startPage = Math.max(2, currentPage - 1), endPage = Math.min(totalPages - 1, currentPage + 1);
            if (currentPage <= 3) endPage = 4;
            if (currentPage >= totalPages - 2) startPage = totalPages - 3;
            for (let i = startPage; i <= endPage; i++) els.links.appendChild(createPageButton(i));
            if (currentPage < totalPages - 2) els.links.appendChild(createEllipsis());
            els.links.appendChild(createPageButton(totalPages));
        }
    }

    function setupTableInteractions() {
        if (!tableBody) return;
        let activeEditRow = null;
        tableBody.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-btn');
            if (viewBtn) showDetailsModal(viewBtn.closest('tr').dataset.cargaErp);
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const row = editBtn.closest('tr');
                if (activeEditRow && activeEditRow.row !== row) saveRow(activeEditRow.row, activeEditRow.icon);
                const icon = editBtn.querySelector('i');
                if (icon.classList.contains('fa-edit')) { editRow(row, icon); activeEditRow = { row, icon }; }
                else { saveRow(row, icon); activeEditRow = null; }
            }
        });
        document.querySelectorAll('th[data-column]').forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                sortState.direction = (sortState.column === column && sortState.direction === 'asc') ? 'desc' : 'asc';
                sortState.column = column;
                currentPage = 1;
                renderTable();
            });
        });
        [...document.querySelectorAll('#prevPageBtnMobile, #prevPageBtnDesktop')].forEach(btn => btn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } }));
        [...document.querySelectorAll('#nextPageBtnMobile, #nextPageBtnDesktop')].forEach(btn => btn.addEventListener('click', () => { if (currentPage < Math.ceil(currentTableData.length / itemsPerPage)) { currentPage++; renderTable(); } }));
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            currentTableData = originalData.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(searchTerm)));
            currentPage = 1;
            updateDashboard(currentTableData);
        });
    }

    function editRow(row, icon) {
        icon.className = 'fas fa-save';
        row.querySelectorAll('td[data-field]').forEach(cell => {
            cell.innerHTML = `<input type="text" class="w-full bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 rounded px-1" value="${cell.textContent}">`;
        });
    }

    async function saveRow(row, icon) {
        icon.className = 'fas fa-edit';
        const cargaERP = row.dataset.cargaErp;
        const dataIndex = originalData.findIndex(item => item.cargaERP == cargaERP);
        const currentDataIndex = currentTableData.findIndex(item => item.cargaERP == cargaERP);
        const updatedObject = { ...originalData[dataIndex] };
        row.querySelectorAll('td[data-field]').forEach(cell => {
            updatedObject[cell.dataset.field] = cell.querySelector('input').value;
        });
        if (dataIndex > -1) originalData[dataIndex] = updatedObject;
        if (currentDataIndex > -1) currentTableData[currentDataIndex] = updatedObject;
        updateDashboard(currentTableData);
        const db = await getDB();
        db.transaction([STORES.entregas], "readwrite").objectStore(STORES.entregas).put(updatedObject);
    }

    function showDetailsModal(cargaERP) {
        const rowData = originalData.find(row => row.cargaERP == cargaERP);
        if (!rowData || !detailsModal) return;
        const modalBody = document.getElementById('modalBody');
        const modalEditBtn = document.getElementById('modalEditBtn');
        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (!modalBody || !modalEditBtn || !modalSaveBtn) return;
        modalBody.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">${Object.entries(rowData).map(([key, value]) => `<div class="border-b pb-2"><p class="text-sm font-medium text-gray-500">${key}</p><p class="text-md text-dark dark:text-white" data-field="${key}">${value || 'N/A'}</p></div>`).join('')}</div>`;
        detailsModal.classList.remove('hidden');
        setTimeout(() => { detailsModal.querySelector('.modal-content')?.classList.remove('scale-95'); }, 10);
        modalEditBtn.classList.remove('hidden');
        modalSaveBtn.classList.add('hidden');
    }

    function setupModal() {
        if (!detailsModal) return;
        const closeModal = () => {
            detailsModal.querySelector('.modal-content')?.classList.add('scale-95');
            setTimeout(() => detailsModal.classList.add('hidden'), 300);
        };
        document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
        detailsModal.addEventListener('click', (e) => { if (e.target === detailsModal) closeModal(); });
        document.getElementById('modalEditBtn')?.addEventListener('click', () => {
            document.getElementById('modalBody').querySelectorAll('p[data-field]').forEach(p => { p.innerHTML = `<input type="text" class="w-full bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 rounded px-1" value="${p.textContent}">`; });
            document.getElementById('modalEditBtn').classList.add('hidden');
            document.getElementById('modalSaveBtn').classList.remove('hidden');
        });
        document.getElementById('modalSaveBtn')?.addEventListener('click', async () => {
            const cargaERP = document.getElementById('modalBody').querySelector('p[data-field="cargaERP"] input').value;
            const dataIndex = originalData.findIndex(item => item.cargaERP == cargaERP);
            const updatedObject = { ...originalData[dataIndex] };
            document.getElementById('modalBody').querySelectorAll('p[data-field]').forEach(p => {
                const newValue = p.querySelector('input').value;
                p.innerHTML = newValue;
                updatedObject[p.dataset.field] = newValue;
            });
            if (dataIndex > -1) originalData[dataIndex] = updatedObject;
            const currentDataIndex = currentTableData.findIndex(item => item.cargaERP == cargaERP);
            if (currentDataIndex > -1) currentTableData[currentDataIndex] = updatedObject;
            document.getElementById('modalEditBtn').classList.remove('hidden');
            document.getElementById('modalSaveBtn').classList.add('hidden');
            updateDashboard(currentTableData);
            const db = await getDB();
            db.transaction([STORES.entregas], "readwrite").objectStore(STORES.entregas).put(updatedObject);
        });
    }

    async function loadDeliveryHistory() {
        try {
            const db = await getDB();
            const historyContainer = document.getElementById('deliveryHistoryContainer');
            if (!historyContainer) return;
            historyContainer.innerHTML = '';
            const transaction = db.transaction([STORES.entregas, STORES.deliveryReportNames], "readonly");
            const request = transaction.objectStore(STORES.entregas).index("timestamp").getAll();
            request.onsuccess = async () => {
                const allTimestamps = request.result.map(r => r.timestamp.getTime());
                const uniqueTimestamps = [...new Set(allTimestamps)].sort((a, b) => b - a);
                const reportNames = await getAllDeliveryReportNames(db);
                const totalPages = Math.ceil(uniqueTimestamps.length / historyItemsPerPage);
                const paginatedTimestamps = uniqueTimestamps.slice(historyPage * historyItemsPerPage, (historyPage * historyItemsPerPage) + historyItemsPerPage);
                paginatedTimestamps.forEach(ts => {
                    const date = new Date(ts);
                    const name = reportNames.find(n => n.timestamp === ts)?.name || date.toLocaleString('pt-BR');
                    const historyItemContainer = document.createElement('div');
                    historyItemContainer.className = 'flex items-center justify-between';

                    const checkboxId = `delivery-history-checkbox-${ts}`;
                    const historyItem = document.createElement('div');
                    historyItem.className = 'flex-grow';
                    historyItem.innerHTML = `
                        <input id="${checkboxId}" type="checkbox" value="${ts}" class="custom-checkbox mr-2">
                        <label for="${checkboxId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">${name}</label>
                    `;

                    const editBtn = document.createElement('button');
                    editBtn.className = 'p-2 text-gray-500 hover:text-blue-600';
                    editBtn.innerHTML = '<i class="fas fa-clipboard"></i>';
                    editBtn.onclick = () => { const newName = prompt("Digite o novo nome para a importação:", name); if (newName) saveDeliveryReportName(ts, newName); };
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'p-2 text-gray-500 hover:text-red-600';
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    deleteBtn.onclick = () => { if (confirm(`Tem certeza que deseja excluir a importação "${name}"?`)) deleteDeliveryReport(date); };

                    historyItemContainer.appendChild(historyItem);
                    historyItemContainer.appendChild(editBtn);
                    historyItemContainer.appendChild(deleteBtn);
                    historyContainer.appendChild(historyItemContainer);
                });
                updateHistoryPaginationControls(uniqueTimestamps.length, totalPages);
            };
        } catch (error) { console.error("Falha ao carregar histórico de entregas:", error); }
    }

    async function loadReportByTimestamp(timestamp) {
        try {
            const db = await getDB();
            const request = db.transaction([STORES.entregas], "readonly").objectStore(STORES.entregas).index("timestamp").getAll(IDBKeyRange.only(timestamp));
            request.onsuccess = () => { currentTableData = request.result; updateDashboard(currentTableData); };
        } catch (error) { console.error("Falha ao carregar relatório por timestamp:", error); }
    }

    function getAllDeliveryReportNames(db) {
        return new Promise((resolve, reject) => {
            const request = db.transaction([STORES.deliveryReportNames], "readonly").objectStore(STORES.deliveryReportNames).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveDeliveryReportName(timestamp, name) {
        try {
            const db = await getDB();
            db.transaction([STORES.deliveryReportNames], "readwrite").objectStore(STORES.deliveryReportNames).put({ timestamp, name });
            await loadDeliveryHistory();
        } catch (error) { console.error("Falha ao salvar nome do relatório de entrega:", error); }
    }

    async function deleteDeliveryReport(timestamp) {
        try {
            const db = await getDB();
            const entregasTx = db.transaction([STORES.entregas], "readwrite");
            const request = entregasTx.objectStore(STORES.entregas).index("timestamp").openCursor(IDBKeyRange.only(timestamp));
            request.onsuccess = (event) => { const cursor = event.target.result; if (cursor) { cursor.delete(); cursor.continue(); } };
            await new Promise(resolve => entregasTx.oncomplete = resolve);
            const namesTx = db.transaction([STORES.deliveryReportNames], "readwrite");
            namesTx.objectStore(STORES.deliveryReportNames).delete(timestamp.getTime());
            await new Promise(resolve => namesTx.oncomplete = resolve);
            await loadInitialData();
        } catch (error) { console.error("Falha ao deletar relatório de entrega:", error); }
    }
    function updateLogo() {
        const logo = document.getElementById('company-logo');
        const isDark = document.documentElement.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (isDark) {
            logo.src = 'public/images/logoBranca.png';
        } else {
            logo.src = 'public/images/logo.png';
        }
    }

    // Detecta mudança manual do tema (caso use toggle de tema)
    const observer = new MutationObserver(updateLogo);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Detecta mudança automática do sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateLogo);

    // Atualiza ao carregar a página
    window.addEventListener('DOMContentLoaded', updateLogo);

    function updateHistoryPaginationControls(totalItems, totalPages) {
        const els = { summary: document.getElementById('deliveryHistoryPaginationSummary'), prevMobile: document.getElementById('deliveryHistoryPrevBtnMobile'), nextMobile: document.getElementById('deliveryHistoryNextBtnMobile'), prevDesktop: document.getElementById('deliveryHistoryPrevBtnDesktop'), nextDesktop: document.getElementById('deliveryHistoryNextBtnDesktop'), links: document.getElementById('deliveryHistoryPaginationLinks') };
        if (Object.values(els).some(el => !el)) return;
        const startItem = totalItems > 0 ? (historyPage * historyItemsPerPage) + 1 : 0;
        const endItem = Math.min((historyPage + 1) * historyItemsPerPage, totalItems);
        els.summary.innerHTML = `Mostrando <span class="font-medium">${startItem}</span> a <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> resultados`;
        const hasPrev = historyPage > 0, hasNext = historyPage < totalPages - 1;
        [els.prevMobile, els.prevDesktop].forEach(btn => btn.disabled = !hasPrev);
        [els.nextMobile, els.nextDesktop].forEach(btn => btn.disabled = !hasNext);
        els.links.innerHTML = '';
        const createPageButton = (page) => {
            const button = document.createElement('button');
            button.textContent = page + 1;
            button.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === historyPage ? 'z-10 bg-primary border-primary text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`;
            button.addEventListener('click', () => { historyPage = page; loadDeliveryHistory(); });
            return button;
        };
        const createEllipsis = () => { const span = document.createElement('span'); span.textContent = '...'; span.className = 'relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300'; return span; };
        if (totalPages <= 7) {
            for (let i = 0; i < totalPages; i++) els.links.appendChild(createPageButton(i));
        } else {
            els.links.appendChild(createPageButton(0));
            if (historyPage > 2) els.links.appendChild(createEllipsis());
            let startPage = Math.max(1, historyPage - 1), endPage = Math.min(totalPages - 2, historyPage + 1);
            if (historyPage <= 2) endPage = 3;
            if (historyPage >= totalPages - 3) startPage = totalPages - 4;
            for (let i = startPage; i <= endPage; i++) els.links.appendChild(createPageButton(i));
            if (historyPage < totalPages - 3) els.links.appendChild(createEllipsis());
            els.links.appendChild(createPageButton(totalPages - 1));
        }
    }

    // --- Event Listeners ---
    if (importBtn) importBtn.addEventListener('click', () => {
        if (fileInput && fileInput.files.length > 0) {
            const reader = new FileReader();
            reader.onload = (e) => (async () => {
                try {
                    showLoading('Lendo o arquivo...');
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    await processDataInChunks(jsonData);
                } catch (error) { console.error("Erro ao processar o arquivo Excel:", error); alert("Ocorreu um erro ao ler o arquivo: " + error.message); hideLoading(); }
            })();
            reader.readAsArrayBuffer(fileInput.files[0]);
        } else { alert("Por favor, selecione um arquivo Excel."); }
    });

    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', async () => {
        currentPage = 1;
        const getSelectedOptions = (optionsId) => Array.from(document.querySelectorAll(`#${optionsId} input[type="checkbox"]:checked`)).map(cb => cb.value);
        
        // Obter históricos selecionados
        const selectedTimestamps = getSelectedOptions('deliveryHistoryContainer').map(ts => parseInt(ts, 10));

        if (selectedTimestamps.length === 0) {
            // Se nenhum histórico selecionado, usar todos os dados originais
            currentTableData = [...originalData];
        } else {
            // Carregar dados dos timestamps selecionados
            try {
                const db = await getDB();
                const transaction = db.transaction([STORES.entregas], "readonly");
                const store = transaction.objectStore(STORES.entregas);
                const index = store.index("timestamp");

                const promises = selectedTimestamps.map(ts => {
                    return new Promise((resolve, reject) => {
                        const request = index.getAll(IDBKeyRange.only(new Date(ts)));
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                });

                const results = await Promise.all(promises);
                currentTableData = results.flat();
            } catch (error) {
                console.error("Falha ao carregar dados dos históricos selecionados:", error);
                currentTableData = [...originalData];
            }
        }

        // Aplicar filtros adicionais
        const selectedMotoristas = getSelectedOptions('motoristaFilterOptions');
        const selectedDestinos = getSelectedOptions('destinoFilterOptions');
        const selectedVeiculos = getSelectedOptions('veiculoFilterOptions');
        const selectedAjudantes = getSelectedOptions('ajudanteFilterOptions');
        const selectedFiliais = getSelectedOptions('filialFilterOptions');
        
        currentTableData = currentTableData.filter(row =>
            (selectedMotoristas.length === 0 || selectedMotoristas.includes(row.motorista)) &&
            (selectedDestinos.length === 0 || selectedDestinos.includes(row.destino)) &&
            (selectedVeiculos.length === 0 || selectedVeiculos.includes(row.veiculo)) &&
            (selectedAjudantes.length === 0 || selectedAjudantes.includes(row.ajudante1)) &&
            (selectedFiliais.length === 0 || selectedFiliais.includes(row.filialExpedicao))
        );
        
        updateDashboard(currentTableData);
    });

    document.getElementById('toggleValorBtn')?.addEventListener('click', () => {
        if (isValorVisible) { isValorVisible = false; updateValorDisplay(); }
        else if (passwordModal) passwordModal.classList.remove('hidden');
    });

    document.getElementById('submitPasswordBtn')?.addEventListener('click', () => {
        if (passwordInput && passwordInput.value === '3323') {
            isValorVisible = true;
            updateValorDisplay();
            if (passwordModal) passwordModal.classList.add('hidden');
            passwordInput.value = '';
        } else { alert('Senha incorreta!'); }
    });

    document.getElementById('cancelPasswordBtn')?.addEventListener('click', () => {
        if (passwordModal) passwordModal.classList.add('hidden');
        if (passwordInput) passwordInput.value = '';
    });

    if (clearDbBtn) clearDbBtn.addEventListener('click', async () => {
        if (confirm("Tem certeza que deseja apagar TODOS os dados salvos? Esta ação não pode ser desfeita.")) {
            try { await deleteDB(); alert("Banco de dados zerado com sucesso!"); location.reload(); }
            catch (error) { console.error("Falha ao zerar o banco de dados:", error); alert("Ocorreu um erro ao tentar zerar o banco de dados."); }
        }
    });

    if (sidebar && sidebarToggle) sidebarToggle.addEventListener('click', (e) => { e.stopPropagation(); sidebar.classList.toggle('collapsed'); });

    document.addEventListener('click', (e) => {
        if (window.innerWidth < 1024 && sidebar && !sidebar.contains(e.target) && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
        }
        const prevBtn = e.target.closest('#deliveryHistoryPrevBtnMobile, #deliveryHistoryPrevBtnDesktop');
        if (prevBtn && !prevBtn.disabled && historyPage > 0) {
            historyPage--;
            loadDeliveryHistory();
        }
        const nextBtn = e.target.closest('#deliveryHistoryNextBtnMobile, #deliveryHistoryNextBtnDesktop');
        if (nextBtn && !nextBtn.disabled) {
            const totalPages = Math.ceil(originalData.map(r => r.timestamp.getTime()).filter((v, i, a) => a.indexOf(v) === i).length / historyItemsPerPage);
            if (historyPage < totalPages - 1) {
                historyPage++;
                loadDeliveryHistory();
            }
        }
    });

    if (themeToggleBtn) {
        const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
        const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
        const updateChartColors = chart => {
            if (!chart) return;
            const fontColor = document.documentElement.classList.contains('dark') ? '#E5E7EB' : '#111827';
            if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = fontColor;
            if (chart.options.scales?.x?.ticks) chart.options.scales.x.ticks.color = fontColor;
            if (chart.options.scales?.y?.ticks) chart.options.scales.y.ticks.color = fontColor;
            chart.update();
        };

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
                if (themeToggleLightIcon) themeToggleLightIcon.classList.remove('hidden');
                if (themeToggleDarkIcon) themeToggleDarkIcon.classList.add('hidden');
            } else {
                document.documentElement.classList.remove('dark');
                if (themeToggleDarkIcon) themeToggleDarkIcon.classList.remove('hidden');
                if (themeToggleLightIcon) themeToggleLightIcon.classList.add('hidden');
            }
            [deliveriesChart, helpersChart, volumeChart, valueChart, filialChart].forEach(updateChartColors);
        };
        const preferredTheme = localStorage.getItem('color-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(preferredTheme);
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('color-theme', newTheme);
            applyTheme(newTheme);
        });
    }

    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            backToTopButton.classList.toggle('opacity-0', window.pageYOffset <= 300);
            backToTopButton.classList.toggle('invisible', window.pageYOffset <= 300);
        });
        backToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    if (exportDataBtn) exportDataBtn.addEventListener('click', () => {
        const worksheet = XLSX.utils.json_to_sheet(currentTableData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Roteirização");
        XLSX.writeFile(workbook, "Detalhes_Roteirizacao.xlsx");
    });

    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

    // --- Initial Load ---
    loadInitialData();
    setupTableInteractions();
    setupFilterInteractions();
    setupModal();
});
