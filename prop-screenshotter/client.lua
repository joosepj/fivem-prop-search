local isRunning = false

-- Bandwidth for latent events: 4 MB/s. Handles a 1 MB PNG (~1.4 MB base64) in ~0.35s.
local LATENT_BPS = 4 * 1024 * 1024

-- Tracks R2 upload completion signalled back from the server
local uploadDone = {}

RegisterNetEvent('prop-screenshotter:imgDone')
AddEventHandler('prop-screenshotter:imgDone', function(propName, shotType)
    uploadDone[propName .. '|' .. shotType] = true
end)

-- ── Entry point ────────────────────────────────────────────────────────────────
RegisterNetEvent('prop-screenshotter:start')
AddEventHandler('prop-screenshotter:start', function(propName)
    if isRunning then return end
    isRunning = true

    Citizen.CreateThread(function()
        local ok, err = pcall(CaptureAndUpload, propName)
        if not ok then
            print('[Screenshotter] Error: ' .. tostring(err))
            TriggerServerEvent('prop-screenshotter:done', propName, false, tostring(err))
            isRunning = false
        end
    end)
end)

-- ── Send one screenshot to the server via latent event ────────────────────────
function SendScreenshot(propName, shotType)
    local key = propName .. '|' .. shotType
    uploadDone[key] = false

    exports['screenshot-basic']:requestScreenshot(function(dataUrl)
        if not dataUrl or dataUrl == '' then
            uploadDone[key] = true
            return
        end

        local b64 = string.match(dataUrl, '^data:[^;]+;base64,(.+)$')
        if not b64 then
            print('[Screenshotter] Unexpected data URL format for ' .. propName)
            uploadDone[key] = true
            return
        end

        -- FiveM handles chunking internally; no manual splitting needed
        TriggerLatentServerEvent('prop-screenshotter:img', LATENT_BPS, propName, shotType, b64)
    end)

    -- Wait for server to confirm R2 upload is complete (60 s max)
    local t = 0
    while not uploadDone[key] and t < 600 do
        Wait(100)
        t = t + 1
    end
    uploadDone[key] = nil

    if t >= 600 then
        print('[Screenshotter] Upload timed out: ' .. propName .. '/' .. shotType)
    end
end

-- ── Main capture function ──────────────────────────────────────────────────────
function CaptureAndUpload(propName)
    local model = GetHashKey(propName)

    if not IsModelValid(model) then
        TriggerServerEvent('prop-screenshotter:done', propName, false, 'invalid model')
        isRunning = false
        return
    end

    RequestModel(model)
    local attempts = 0
    while not HasModelLoaded(model) do
        Wait(100)
        attempts = attempts + 1
        if attempts > 100 then
            TriggerServerEvent('prop-screenshotter:done', propName, false, 'load timeout')
            isRunning = false
            return
        end
    end

    local minDim, maxDim = GetModelDimensions(model)
    local sX      = maxDim.x - minDim.x
    local sY      = maxDim.y - minDim.y
    local sZ      = maxDim.z - minDim.z
    local maxSide = math.max(sX, sY, sZ)
    local dist    = math.max(maxSide * 2.0, 1.5)

    local ped     = PlayerPedId()
    local pos     = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local rad     = math.rad(heading)
    local fwdX    = math.sin(rad)
    local fwdY    = math.cos(rad)

    local prop = CreateObject(model,
        pos.x + fwdX * (dist + 5.0),
        pos.y + fwdY * (dist + 5.0),
        pos.z, false, false, false)
    PlaceObjectOnGroundProperly(prop)
    FreezeEntityPosition(prop, true)
    Wait(350)

    local pCoords = GetEntityCoords(prop)
    local center  = vector3(pCoords.x, pCoords.y, pCoords.z + sZ * 0.5)

    DisplayHud(false)
    DisplayRadar(false)
    SetEntityVisible(ped, false, false)
    NetworkOverrideClockTime(12, 0, 0)
    SetWeatherTypePersist('EXTRASUNNY')
    SetWeatherTypeNow('EXTRASUNNY')

    -- ── Overview: 3/4 angle from above ───────────────────────────────────────
    local oDist = math.max(dist * 1.4, 2.0)
    local cam1  = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(cam1,
        center.x - oDist * 0.65,
        center.y - oDist * 0.65,
        center.z + oDist * 0.85)
    PointCamAtCoord(cam1, center.x, center.y, center.z)
    SetCamFov(cam1, 50.0)
    SetCamActive(cam1, true)
    RenderScriptCams(true, false, 0, true, false)
    Wait(700)

    SendScreenshot(propName, 'overview')

    -- ── Player eye-level ──────────────────────────────────────────────────────
    SetCamActive(cam1, false)
    DestroyCam(cam1, false)

    local cam2 = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(cam2,
        pCoords.x - fwdX * dist,
        pCoords.y - fwdY * dist,
        pCoords.z + 1.65)
    PointCamAtCoord(cam2, center.x, center.y, center.z)
    SetCamFov(cam2, 50.0)
    SetCamActive(cam2, true)
    RenderScriptCams(true, false, 0, true, false)
    Wait(400)

    SendScreenshot(propName, 'player')

    -- ── Cleanup ───────────────────────────────────────────────────────────────
    SetCamActive(cam2, false)
    DestroyCam(cam2, false)
    RenderScriptCams(false, false, 0, true, false)
    DisplayHud(true)
    DisplayRadar(true)
    SetEntityVisible(ped, true, false)
    DeleteObject(prop)
    SetModelAsNoLongerNeeded(model)

    TriggerServerEvent('prop-screenshotter:done', propName, true, '')
    isRunning = false
end
