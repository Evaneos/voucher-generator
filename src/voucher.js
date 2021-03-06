import './main.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import { addMonths, format } from 'date-fns';
import { PDFDocument } from 'pdf-lib';
import { sprintf } from 'sprintf-js';

import AUT from './templates/AUT.txt';
import BEL from './templates/BEL.txt';
import CAN from './templates/CAN.txt';
import CHE from './templates/CHE.txt';
import ESP from './templates/ESP.txt';
import FRA from './templates/FRA.txt';
import GBR from './templates/GBR.txt';
import GER from './templates/GER.txt';
import ITA from './templates/ITA.txt';
import NLD from './templates/NLD.txt';
import USA from './templates/USA.txt';

const defaultMarket = 'other';
const marketMap = {
    fr: { template: FRA, locale: 'fr-FR', dateFormat: 'jj/mm/aaaa' },
    it: { template: ITA, locale: 'it-IT', dateFormat: 'jj/mm/aaaa' },
    es: { template: ESP, locale: 'es-ES', dateFormat: 'jj/mm/aaaa' },
    de: { template: GER, locale: 'de-DE', dateFormat: 'jj/mm/aaaa' },
    be: { template: BEL, locale: 'fr-BE', dateFormat: 'jj/mm/aaaa' },
    nl: { template: NLD, locale: 'nl-NL', dateFormat: 'jj/mm/aaaa' },
    ch: { template: CHE, locale: 'fr-CH', dateFormat: 'jj/mm/aaaa' },
    at: { template: AUT, locale: 'de-AT', dateFormat: 'jj/mm/aaaa' },
    gb: { template: GBR, locale: 'en-GB', dateFormat: 'jj/mm/aaaa' },
    ca: { template: CAN, locale: 'en-CA', dateFormat: 'mm/dd/yyyy' },
    us: { template: USA, locale: 'en-US', dateFormat: 'mm/dd/yyyy' },
    other: { template: USA, locale: 'en-US', dateFormat: 'mm/dd/yyyy' },
};

function serializeFormData(market, formData) {
    return Array.from(formData).reduce((entries, entry) => {
        if (entry[0].match(/-date/)) {
            entry[1] = new Date(entry[1]).toLocaleDateString(market.locale);
        }
        return { ...entries, [entry[0].replace(/-/g, '_')]: entry[1] };
    }, {});
}

async function drawLogo(pdf, logo, margin) {
    if (logo instanceof File === false) {
        return;
    }

    let embedMethod;
    switch (logo.type) {
        case 'image/png':
            embedMethod = 'embedPng';
            break;
        case 'image/jpg':
        case 'image/jpeg':
            embedMethod = 'embedJpg';
            break;
    }

    const buffer = await logo.arrayBuffer();
    const embeddedLogo = await pdf[embedMethod](buffer);

    const { height, width } = embeddedLogo;

    const size = 120;
    const factor = Math.max(width / size, height / size);
    const [tWidth, tHeight] = [width / factor, height / factor];

    for (let page of pdf.getPages()) {
        page.drawImage(embeddedLogo, {
            x: page.getWidth() - tWidth - margin,
            y: page.getHeight() - tHeight - margin,
            width: tWidth,
            height: tHeight,
        });
    }
}

async function drawText(pdf, market, formData, margin) {
    const template = await (await fetch(market.template)).text();

    const doc = sprintf(template, {
        ...formData,
        creation_date: new Date().toLocaleDateString(market.locale),
        date_format: market.dateFormat,
    })
        .replace(/\n/g, ' \n')
        .split('---');

    for (let text of doc) {
        const page = pdf.addPage();
        page.drawText(text.trim(), {
            x: margin,
            y: page.getHeight() - margin,
            maxWidth: page.getWidth() - margin * 2,
            size: 12,
            lineHeight: 15,
        });
    }
}

async function generateVoucherPdf(market, formData) {
    const pdf = await PDFDocument.create();
    const margin = 60;

    await drawText(pdf, market, formData, margin);

    if (formData.logo instanceof File && formData.logo.size > 0) {
        try {
            await drawLogo(pdf, formData.logo, margin);
        } catch (error) {
            console.error(error);
        }
    }

    return new Blob([await pdf.save()], { type: 'application/pdf' });
}

const agencyFields = [
    'logo',
    'agency-name',
    'agency-address-address1',
    'agency-address-address2',
    'agency-address-city',
    'agency-address-zip',
    'agency-address-country',
];

/**
 * @param   {FormData}  formData
 * @return  {void}
 */
async function persistAgencyValues(formData) {
    for (let key of agencyFields) {
        let value = formData.get(key);
        if (value === null || value === '') {
            continue;
        }
        if (value instanceof File) {
            continue;
        }
        window.localStorage.setItem(key, value);
    }
}

function restoreAgencyValues() {
    const fields = document.forms['information'].elements;

    for (let key of agencyFields) {
        let value = window.localStorage.getItem(key);
        if (value === null) {
            continue;
        }
        if (key === 'logo') {
            continue;
        }
        try {
            fields[key].value = value;
        } catch (e) {
            console.error(e);
        }
    }
}

function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
}

function notifyDownload() {
    const snackbar = document.getElementById('snackbar');
    snackbar.classList.remove('d-none');
    setTimeout(() => snackbar.classList.add('show'), 100);

    setTimeout(function () {
        snackbar.classList.remove('show');
        setTimeout(() => snackbar.classList.add('d-none'), 500);
    }, 6000);
}

function fetchFormParamFromLocation(location) {
    if (location.search === '') {
        return [];
    }

    return decodeURIComponent(location.search)
        .replace('?', '')
        .split('&')
        .map((p) => p.split('='));
}

/**
 * @param {HTMLInputElement} arrivalInput
 * @param {HTMLInputElement} departureInput
 *
 * @returns {void}
 */
function checkDepartureDateIsAfterArrivalDate(arrivalInput, departureInput) {
    const arrivalDate = new Date(arrivalInput.value);
    const departureDate = new Date(departureInput.value);

    if (arrivalInput.value === '') {
        return;
    }

    if (arrivalDate > departureDate) {
        departureInput.setCustomValidity(
            'Departure date must be greater than Arrival date'
        );
        return;
    }

    departureInput.setCustomValidity('');
}
document
    .getElementById('departure-date')
    .addEventListener('change', (event) =>
        checkDepartureDateIsAfterArrivalDate(
            document.getElementById('arrival-date'),
            event.target
        )
    );

function setValidityDate(input) {
    const MIN_DATE = new Date(2021, 11, 31);
    const MONTH_TO_ADD = 18;
    const validityDate = addMonths(Date.now(), MONTH_TO_ADD);

    input.value = format(Math.max(validityDate, MIN_DATE), 'yyyy-MM-dd');
}
setValidityDate(document.getElementById('validity-date'));

/**
 * @param   {HTMLInputElement|HTMLTextAreaElement}  input
 * @param   {HTMLElement}  indicator
 *
 * @return  {void}
 */
function maxLengthIndicator(input, indicator) {
    function updateIndicator(input, indicator) {
        const maxLength = input.maxLength;
        const length = input.value.length;
        indicator.textContent = `${length}/${maxLength}`;
    }

    input.addEventListener(
        'keyup',
        (event) => updateIndicator(event.target, indicator),
        { passive: true }
    );
    updateIndicator(input, indicator);
}
maxLengthIndicator(
    document.getElementById('side-notes'),
    document.getElementById('side-notes-maxlength-indicator')
);

const form = document.getElementById('information');
form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();

    const formData = new FormData(submitEvent.target);
    await persistAgencyValues(formData);

    const countryOrigin = formData.get('country-origin');

    let market = marketMap[countryOrigin];
    if (market === undefined) {
        console.error(
            sprintf(
                'Market %s does not exists, default to %s',
                countryOrigin,
                defaultMarket
            )
        );
        market = marketMap[defaultMarket];
    }

    const now = new Date();
    const data = serializeFormData(market, formData);
    const pdfBlob = await generateVoucherPdf(market, data);

    const creationDate = now.toLocaleDateString('en-US');
    const creationHour = now
        .toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
        })
        .replace(/:/g, '_');
    downloadBlob(
        pdfBlob,
        `voucher-${data.full_name
            .toLowerCase()
            .replace(/ /g, '_')}-${creationDate}_${creationHour}.pdf`
    );
    notifyDownload();
});

/**
 * @param   {Event}  event
 *
 * @return  {void}
 */
function displayValidationErrors(event) {
    const field = event.target;
    let errorMessageContainer = field.parentElement.querySelector(
        '.invalid-feedback'
    );

    if (errorMessageContainer === null) {
        errorMessageContainer = document.createElement('div');
        errorMessageContainer.classList.add('invalid-feedback');

        field.parentElement.appendChild(errorMessageContainer);
    }

    if (field.validity.valid === true) {
        field.classList.add('is-valid');
        field.classList.remove('is-invalid');
        errorMessageContainer.textContent = '';
        return;
    }

    field.classList.remove('is-valid');
    field.classList.add('is-invalid');

    errorMessageContainer.textContent = field.validationMessage;
}
form.addEventListener('change', displayValidationErrors, { passive: true });
form.addEventListener(
    'invalid',
    (event) => {
        event.preventDefault();
        displayValidationErrors(event);
    },
    { capture: true }
);

fetchFormParamFromLocation(document.location).forEach((q) => {
    try {
        form.elements[q[0]].value = q[1];
    } catch (e) {
        console.error(
            sprintf('Failed to assign parameter %s with value %s', ...q)
        );
    }
});

restoreAgencyValues();
