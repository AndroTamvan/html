const API_URL = 'https://YOUR-API-DOMAIN/api/stats'
const REFRESH_INTERVAL = 2000

let lastData = null
let isFirstLoad = true

const $ = (id) => document.getElementById(id)

function clamp(value, min = 0, max = 100) {
    return Math.min(Math.max(Number(value) || 0, min), max)
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0

    if (value < 1024) return `${value.toFixed(0)} B`
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
    if (value < 1024 ** 4) return `${(value / 1024 ** 3).toFixed(2)} GB`

    return `${(value / 1024 ** 4).toFixed(2)} TB`
}

function formatSpeed(bytesPerSecond) {
    const value = Number(bytesPerSecond) || 0

    if (value < 1024) {
        return `${value.toFixed(0)} B/s`
    }

    if (value < 1024 ** 2) {
        return `${(value / 1024).toFixed(1)} KB/s`
    }

    if (value < 1024 ** 3) {
        return `${(value / 1024 ** 2).toFixed(1)} MB/s`
    }

    return `${(value / 1024 ** 3).toFixed(2)} GB/s`
}

function formatUptime(seconds) {
    let value = Number(seconds) || 0

    const days = Math.floor(value / 86400)
    value %= 86400

    const hours = Math.floor(value / 3600)
    value %= 3600

    const minutes = Math.floor(value / 60)
    const secs = Math.floor(value % 60)

    const parts = []

    if (days) parts.push(`${days}d`)
    if (hours) parts.push(`${hours}h`)
    if (minutes) parts.push(`${minutes}m`)

    parts.push(`${secs}s`)

    return parts.join(' ')
}

function setConnection(online) {
    const dot = document.querySelector('.status-dot')
    const footerDot = document.querySelector('.footer-dot')

    const connectionText = $('connectionText')
    const footerStatus = $('footerStatus')

    if (online) {
        dot?.classList.add('online')
        footerDot?.classList.add('online')

        if (connectionText) {
            connectionText.textContent = 'CONNECTED'
        }

        if (footerStatus) {
            footerStatus.textContent = 'CONNECTED'
        }
    } else {
        dot?.classList.remove('online')
        footerDot?.classList.remove('online')

        if (connectionText) {
            connectionText.textContent = 'DISCONNECTED'
        }

        if (footerStatus) {
            footerStatus.textContent = 'DISCONNECTED'
        }
    }
}

function showToast(message) {
    const toast = $('toast')

    if (!toast) return

    toast.textContent = message
    toast.classList.add('show')

    clearTimeout(showToast.timer)

    showToast.timer = setTimeout(() => {
        toast.classList.remove('show')
    }, 2500)
}

function updateCPU(cpu) {
    const usage = clamp(cpu?.usage)

    $('cpuValue').textContent = `${usage.toFixed(1)}%`
    $('cpuBar').style.width = `${usage}%`

    $('cpuDetail').textContent =
        cpu?.model ||
        cpu?.detail ||
        'CPU usage'

    $('cpuCores').textContent =
        `${cpu?.cores || 1} CORES`
}

function updateRAM(ram) {
    const usage = clamp(ram?.usage)

    $('ramValue').textContent = `${usage.toFixed(1)}%`
    $('ramBar').style.width = `${usage}%`

    $('ramUsed').textContent =
        ram?.usedFormatted ||
        formatBytes(ram?.used)

    $('ramTotal').textContent =
        ram?.totalFormatted ||
        formatBytes(ram?.total)
}

function updateNetwork(network) {
    const rx = Number(network?.rxRate) || 0
    const tx = Number(network?.txRate) || 0

    $('rxValue').textContent = formatSpeed(rx)
    $('txValue').textContent = formatSpeed(tx)

    $('rxTotal').textContent =
        formatBytes(network?.rxBytes || 0)

    $('txTotal').textContent =
        formatBytes(network?.txBytes || 0)

    /*
     * Network bar bukan persentase resource.
     * Bar dibuat relatif terhadap nilai transfer
     * tertinggi yang diterima selama sesi dashboard.
     */

    const maxRx = Math.max(
        Number(network?.maxRxRate) || 0,
        rx,
        1
    )

    const maxTx = Math.max(
        Number(network?.maxTxRate) || 0,
        tx,
        1
    )

    $('rxBar').style.width =
        `${clamp((rx / maxRx) * 100)}%`

    $('txBar').style.width =
        `${clamp((tx / maxTx) * 100)}%`
}

function updateRuntime(data) {
    $('hostname').textContent =
        data.hostname || '---'

    $('os').textContent =
        data.os || '---'

    $('arch').textContent =
        data.arch || '---'

    $('node').textContent =
        data.node || '---'

    $('uptime').textContent =
        formatUptime(data.uptime)

    const load = Array.isArray(data.load)
        ? data.load
            .slice(0, 3)
            .map(v => Number(v).toFixed(2))
            .join(' / ')
        : '--'

    $('load').textContent = load
}

function updateLatency(data) {
    const latency = Math.max(
        0,
        Number(data.latency) || 0
    )

    $('latency').textContent =
        Math.round(latency)

    /*
     * 0ms   = 0%
     * 100ms = 20%
     * 250ms = 50%
     * 500ms = 100%
     */

    const width = clamp(
        (latency / 500) * 100
    )

    $('latencyBar').style.width =
        `${width}%`

    let status = 'EXCELLENT'

    if (latency > 500) {
        status = 'HIGH'
    } else if (latency > 250) {
        status = 'MODERATE'
    } else if (latency > 100) {
        status = 'GOOD'
    }

    $('latencyStatus').textContent = status
}

function updateTime() {
    const now = new Date()

    $('lastUpdate').textContent =
        now.toLocaleTimeString('id-ID', {
            hour12: false
        })
}

function updateDashboard(data) {
    if (!data) return

    updateCPU(data.cpu || {})
    updateRAM(data.ram || {})
    updateNetwork(data.network || {})
    updateRuntime(data)
    updateLatency(data)

    updateTime()
    setConnection(true)

    lastData = data

    if (isFirstLoad) {
        isFirstLoad = false
    }
}

async function fetchStats() {
    try {
        const started = performance.now()

        const response = await fetch(
            `${API_URL}?t=${Date.now()}`,
            {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json'
                }
            }
        )

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            )
        }

        const data = await response.json()

        /*
         * Kalau backend belum mengirim latency,
         * gunakan waktu request sebagai fallback.
         */
        if (
            data.latency === undefined ||
            data.latency === null
        ) {
            data.latency =
                performance.now() - started
        }

        updateDashboard(data)

    } catch (error) {
        console.error(
            '[SERVER MONITOR]',
            error
        )

        setConnection(false)

        if (lastData) {
            $('lastUpdate').textContent =
                'CONNECTION LOST'
        }

        if (isFirstLoad) {
            showToast(
                'Unable to connect to server API'
            )
        }
    }
}

function startMonitor() {
    fetchStats()

    setInterval(
        fetchStats,
        REFRESH_INTERVAL
    )
}

document.addEventListener(
    'DOMContentLoaded',
    startMonitor
)
