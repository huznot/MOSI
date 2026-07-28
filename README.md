mosi - manitoba outdoor safety index

VIDEO WALKTHROUGH : youtube: https://www.youtube.com/shorts/96YkiCytAJQ?si=b6-sGoZ2fFkh8LpQ

an app that models vector-borne infection and outdoor environmental risk across manitoba communities. pulls live data from twelve government apis (temperature, humidity, precipitation, historical outbreak patterns) and turns it into a single risk score using biological proxy models i built and tested against real surveillance data.

won a manitoba schools science symposium silver medal and the canadian metereological and oceanographic society excellence in environmental science award. the vector-borne model was built with mentorship from dr. michael drebot, former director of zoonotic diseases at canada's national microbiology lab.

to run it:

```bash
npm install
npx expo start
```

what's in it: overview, map, alerts, insights, and about tabs. live regional risk scoring across weather, air quality, wildfire, water, vector-borne disease, and health advisories. beach water quality monitoring (e. coli / algal blooms). boreal vector modelling for west nile, jamestown canyon virus, and snowshoe hare virus. real-time manitoba emergency alerts and hydro outage tracking. 7-day forecasting compared against a baseline.

the validation folder has the retrospective validation pipeline - it parses official manitoba weekly west nile surveillance data, lines it up with archived daily weather, and reruns the app's own scoring equations against real outbreak history.

```bash
npm run validate:figures
```
