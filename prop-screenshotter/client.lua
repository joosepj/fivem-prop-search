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
    local sX = maxDim.x - minDim.x
    local sY = maxDim.y - minDim.y
    local sZ = maxDim.z - minDim.z

    -- Prop shape classification
    local xyMax    = math.max(sX, sY)
    local isFlat   = sZ < 0.3
    local isTall   = sZ > xyMax * 3.0

    -- FOV: wider for small props so they fill the frame
    local maxSide = math.max(sX, sY, sZ)
    local FOV = math.min(65.0, math.max(55.0, 55.0 + (1.0 - maxSide) * 8.0))
    local tanHalfFov = math.tan(math.rad(FOV * 0.5))

    -- Minimum camera distance to fill frame for a span of size s (with padding)
    local function fitDist(s, pad)
        return (s * 0.5 * (pad or 1.3)) / tanHalfFov
    end

    -- XY diagonal: covers the footprint from any horizontal angle
    local sXY = math.sqrt(sX * sX + sY * sY)

    local ped     = PlayerPedId()
    local pos     = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local rad     = math.rad(heading)
    local fwdX    = math.sin(rad)
    local fwdY    = math.cos(rad)

    local spawnOff = math.max(maxSide * 2.0, 1.5) + 5.0
    local prop = CreateObject(model,
        pos.x + fwdX * spawnOff,
        pos.y + fwdY * spawnOff,
        pos.z, false, false, false)
    PlaceObjectOnGroundProperly(prop)
    FreezeEntityPosition(prop, true)
    -- Extra settle time: thin/tall props can sway after PlaceOnGround
    Wait(isTall and 700 or 500)

    local pCoords = GetEntityCoords(prop)
    local center  = vector3(pCoords.x, pCoords.y, pCoords.z + sZ * 0.5)

    DisplayHud(false)
    DisplayRadar(false)
    SetEntityVisible(ped, false, false)
    NetworkOverrideClockTime(12, 0, 0)
    SetWeatherTypePersist('EXTRASUNNY')
    SetWeatherTypeNow('EXTRASUNNY')

    -- ── Overview: 3/4 angle from above ───────────────────────────────────────
    -- Camera XY offset coefficients: approach at 45° (equal X and Y)
    local horizCoeff = math.sqrt(0.65 * 0.65 + 0.65 * 0.65)  -- ≈ 0.919

    local elevCoeff
    if isFlat then
        elevCoeff = 0.35   -- near top-down so surface texture is visible
    elseif isTall then
        elevCoeff = 0.45   -- shallower angle captures full height better
    else
        elevCoeff = 0.85
    end

    local totalCoeff = math.sqrt(0.65 * 0.65 + 0.65 * 0.65 + elevCoeff * elevCoeff)

    -- Choose oDist so that both the XY footprint and the height fit in frame
    local dForXY = fitDist(isTall and xyMax or sXY) / horizCoeff
    local dForZ  = fitDist(sZ) / totalCoeff
    local oDist  = math.max(dForXY, dForZ, 1.5)

    local cam1 = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(cam1,
        center.x - oDist * 0.65,
        center.y - oDist * 0.65,
        center.z + oDist * elevCoeff)
    PointCamAtCoord(cam1, center.x, center.y, center.z)
    SetCamFov(cam1, FOV)
    SetCamActive(cam1, true)
    RenderScriptCams(true, false, 0, true, false)
    Wait(700)

    SendScreenshot(propName, 'overview')

    -- ── Player eye-level ──────────────────────────────────────────────────────
    SetCamActive(cam1, false)
    DestroyCam(cam1, false)

    -- Fit whichever is larger: horizontal footprint or vertical span
    local eyeH  = pCoords.z + 1.65
    local dEye  = math.max(fitDist(math.max(sXY, sZ)), 1.5)

    local cam2 = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(cam2,
        pCoords.x - fwdX * dEye,
        pCoords.y - fwdY * dEye,
        eyeH)
    PointCamAtCoord(cam2, center.x, center.y, center.z)
    SetCamFov(cam2, FOV)
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
