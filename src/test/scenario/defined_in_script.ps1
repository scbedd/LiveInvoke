Function a {
    param(
        $a = "abc 123",
        $b
    )

    Write-Host $a
    Write-Host $b
}

function a($a = 42, $b = 5) {
    Write-Host $a
    Write-Host $b
}

